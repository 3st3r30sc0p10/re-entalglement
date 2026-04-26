const path = require('path');
// `override: true` so values in project `.env` win over stale shell exports (e.g. LLM_PROVIDER=openai from another session).
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const fs = require('fs');
const os = require('os');

const app = express();

/** Local publication images + spreadsheet (see readme) */
const PUBLICATION_DIR = path.join(__dirname, 'src', 'images-publication');
const PUBLICATION_XLSX = path.join(PUBLICATION_DIR, 'images-publication.xlsx');
const PUBLICATION_MANIFEST = path.join(PUBLICATION_DIR, 'publication-manifest.json');

let publicationCatalogCache = null;

function normalizeHeaderKey(key) {
    return String(key || '')
        .replace(/\uFEFF/g, '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
}

function getCell(row, ...headerAliases) {
    const wanted = headerAliases.map((a) => normalizeHeaderKey(a));
    for (const key of Object.keys(row)) {
        const nk = normalizeHeaderKey(key);
        if (wanted.includes(nk)) return String(row[key] ?? '').trim();
    }
    return '';
}

function normalizePublicationRow(row) {
    const videoName = getCell(row, 'Video-name', 'Videoname', 'Video');
    const imageName = getCell(row, 'Image-name', 'Imagename', 'Image', 'Filename');
    const keywords = getCell(row, 'keywords', 'keyword', 'tags', 'Tags');
    const urlCell = getCell(row, 'url', 'URL', 'path');
    const description = getCell(row, 'description', 'Description', 'caption');

    let file = imageName;
    if (!file && urlCell) {
        const stripped = urlCell.replace(/\\/g, '/').replace(/.*images-publication\/?/i, '');
        file = path.basename(stripped.split('?')[0] || '');
    }
    file = path.basename(file || '');
    return { videoName, imageName: file, keywords, description, urlPath: urlCell };
}

function loadPublicationCatalog() {
    if (publicationCatalogCache) return publicationCatalogCache;

    const tryXlsx = () => {
        // eslint-disable-next-line global-require
        const XLSX = require('xlsx');
        if (!fs.existsSync(PUBLICATION_XLSX)) return null;
        const wb = XLSX.readFile(PUBLICATION_XLSX);
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
        return rows.map(normalizePublicationRow).filter((r) => r.imageName);
    };

    const tryJson = () => {
        if (!fs.existsSync(PUBLICATION_MANIFEST)) return null;
        const raw = JSON.parse(fs.readFileSync(PUBLICATION_MANIFEST, 'utf8'));
        const rows = Array.isArray(raw) ? raw : raw.images || raw.rows || [];
        return rows.map((r) => normalizePublicationRow(r)).filter((x) => x.imageName);
    };

    try {
        const fromXlsx = tryXlsx();
        if (fromXlsx && fromXlsx.length) {
            publicationCatalogCache = fromXlsx;
            console.log(`Publication catalog: ${publicationCatalogCache.length} rows from images-publication.xlsx`);
            return publicationCatalogCache;
        }
    } catch (e) {
        console.warn('Could not load images-publication.xlsx (install xlsx: yarn).', e.message);
    }

    try {
        const fromJson = tryJson();
        if (fromJson && fromJson.length) {
            publicationCatalogCache = fromJson;
            console.log(`Publication catalog: ${publicationCatalogCache.length} rows from publication-manifest.json`);
            return publicationCatalogCache;
        }
    } catch (e) {
        console.warn('Could not load publication-manifest.json.', e.message);
    }

    publicationCatalogCache = [];
    return publicationCatalogCache;
}

function normalizePublicationQuery(q) {
    return String(q || '')
        .normalize('NFKC')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function publicationKeywordsMatch(keywordsStr, searchTerm) {
    const st = normalizePublicationQuery(searchTerm);
    if (!st) return false;
    const kw = normalizePublicationQuery(keywordsStr);
    if (!kw) return false;

    const tokens = kw.split(/[,;|]+/).map((t) => t.trim()).filter(Boolean);
    if (tokens.some((t) => t === st)) return true;
    if (tokens.some((t) => t.includes(st))) return true;
    if (st.length >= 3 && tokens.some((t) => t.length >= 3 && st.includes(t))) return true;

    const words = st.split(/\s+/).filter((w) => w.length > 0);
    if (words.length > 1 && words.every((w) => kw.includes(w))) return true;
    if (words.length === 1 && kw.includes(st)) return true;
    return false;
}

function resolvePublicationFileOnDisk(imageName) {
    const base = path.basename(imageName || '');
    if (!base || base === '.' || base === '..') return null;
    const abs = path.resolve(PUBLICATION_DIR, base);
    if (!abs.startsWith(path.resolve(PUBLICATION_DIR))) return null;
    if (!fs.existsSync(abs)) return null;
    return base;
}
app.use(cors());
app.use(express.json()); // Add JSON parsing middleware

const NYPL_API_URL = 'https://api.repo.nypl.org/api/v2';
const NYPL_TOKEN = 'zdx9mfhnl5jbvlh8';
const EUROPEANA_API_KEY = 'jundompe';
const SMITHSONIAN_API_KEY = 'gB5QaUmCBhXfFdPYOKhL7qTp3KYmkHg1Wx5HTsou';
/** Optional OpenAI-compatible URL (LiteLLM, OpenAI, etc.) — only when `LLM_PROVIDER=openai`. */
const LLM_API_URL = process.env.LLM_API_URL || '';
const LLM_API_KEY = process.env.LLM_API_KEY || '';
/** Default chat backend: Google Gemini (`generativelanguage.googleapis.com`). Set `LLM_PROVIDER=openai` for LiteLLM/OpenAI-compatible proxies. */
const LLM_PROVIDER = (process.env.LLM_PROVIDER || 'gemini').trim().toLowerCase();
/**
 * Default `model` when the client omits it (and for `/api/llm-meta`).
 */
const LLM_DEFAULT_MODEL =
    process.env.LLM_DEFAULT_MODEL ||
    (LLM_PROVIDER === 'gemini' ? 'gemini-2.5-flash' : 'gpt-4o');
const LLM_OPENAI_FALLBACK_MODEL = (process.env.LLM_OPENAI_FALLBACK_MODEL || '').trim();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

/** Gemini ids are invalid on OpenAI-compatible proxies (e.g. LiteLLM with a team allowlist). */
function isGeminiModelName(s) {
    return !!(s && /gemini/i.test(String(s)));
}

/**
 * Resolve model for POST to an OpenAI-compatible URL. Never forwards Gemini ids when the
 * backend is not Gemini (avoids 401 team_model_access_denied from LiteLLM).
 */
function resolveOpenAiCompatibleProxyModel(requestedModel) {
    const req = (requestedModel || '').trim();
    const def = (LLM_DEFAULT_MODEL || 'gpt-4o').trim();
    const chosen = req || def;
    if (!isGeminiModelName(chosen)) return chosen || 'gpt-4o';
    if (def && !isGeminiModelName(def)) return def;
    if (LLM_OPENAI_FALLBACK_MODEL && !isGeminiModelName(LLM_OPENAI_FALLBACK_MODEL)) {
        return LLM_OPENAI_FALLBACK_MODEL;
    }
    return 'gpt-4o';
}
/** Single Markdown/text file (relative to repo root or absolute, under repo) — overrides folder scan when set. */
const GEMINI_KNOWLEDGE_MD_PATH = process.env.GEMINI_KNOWLEDGE_MD_PATH || '';
/** Folder of `.md` / `.txt` files to concatenate (default `knowledge` when unset and `LLM_PROVIDER=gemini`). PDFs are skipped unless excerpted to text. */
const GEMINI_KNOWLEDGE_DIR = process.env.GEMINI_KNOWLEDGE_DIR;

const PROJECT_ROOT = path.resolve(__dirname);
const MAX_GEMINI_KNOWLEDGE_CHARS = 120000;

function isPathInsideProject(absPath) {
    const norm = path.resolve(absPath);
    return norm === PROJECT_ROOT || norm.startsWith(PROJECT_ROOT + path.sep);
}

function resolveProjectPath(raw) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return null;
    const resolved = path.isAbsolute(trimmed) ? path.resolve(trimmed) : path.resolve(__dirname, trimmed);
    if (!isPathInsideProject(resolved)) return null;
    return resolved;
}

/** Collect `.md` / `.txt` files under `dir` (recursive), sorted by relative path. */
function collectTextKnowledgeFiles(dirAbs) {
    if (!fs.existsSync(dirAbs) || !fs.statSync(dirAbs).isDirectory()) return [];
    const out = [];
    const walk = (d) => {
        const entries = fs.readdirSync(d, { withFileTypes: true });
        for (const ent of entries) {
            const full = path.join(d, ent.name);
            if (ent.isDirectory()) walk(full);
            else if (/\.(md|txt)$/i.test(ent.name)) out.push(full);
        }
    };
    walk(dirAbs);
    out.sort((a, b) => a.localeCompare(b, 'en'));
    return out;
}

function readFilesConcatForGemini(paths) {
    let total = '';
    for (const abs of paths) {
        try {
            const rel = path.relative(PROJECT_ROOT, abs);
            const chunk = fs.readFileSync(abs, 'utf8');
            const header = `\n\n## ${rel.replace(/\\/g, '/')}\n\n`;
            const next = total + header + chunk;
            if (next.length > MAX_GEMINI_KNOWLEDGE_CHARS) {
                const room = MAX_GEMINI_KNOWLEDGE_CHARS - total.length - header.length;
                if (room > 500) total += header + chunk.slice(0, room) + '\n\n[…truncated…]\n';
                break;
            }
            total = next;
        } catch (e) {
            console.warn('Gemini: skip knowledge file', abs, e.message);
        }
    }
    return total.trim();
}

if (LLM_PROVIDER === 'gemini' && !GEMINI_API_KEY) {
    console.warn(
        'LLM: LLM_PROVIDER=gemini but GEMINI_API_KEY is empty. Set GEMINI_API_KEY in .env (Google AI Studio).'
    );
}
if (
    LLM_PROVIDER === 'openai' &&
    isGeminiModelName(LLM_DEFAULT_MODEL) &&
    !LLM_OPENAI_FALLBACK_MODEL
) {
    console.warn(
        'LLM: LLM_DEFAULT_MODEL is Gemini-shaped but LLM_PROVIDER=openai. Set a LiteLLM-allowed id on LLM_DEFAULT_MODEL or LLM_OPENAI_FALLBACK_MODEL (e.g. GPT 4.1); otherwise the proxy falls back to gpt-4o.'
    );
}

if (LLM_PROVIDER === 'gemini') {
    console.log('LLM: Google Gemini (generativelanguage.googleapis.com). Chat does not use Duke LiteLLM.');
} else {
    const host = (() => {
        try {
            return new URL(LLM_API_URL).host;
        } catch {
            return '(invalid LLM_API_URL)';
        }
    })();
    console.log('LLM: OpenAI-compatible proxy →', host || LLM_API_URL || '(unset)');
}

let geminiKnowledgeAppend = '';
if (LLM_PROVIDER === 'gemini') {
    try {
        if (GEMINI_KNOWLEDGE_MD_PATH.trim()) {
            const resolved = resolveProjectPath(GEMINI_KNOWLEDGE_MD_PATH);
            if (!resolved) {
                console.warn('Gemini: GEMINI_KNOWLEDGE_MD_PATH must stay under project root; ignored.');
            } else if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
                geminiKnowledgeAppend = fs.readFileSync(resolved, 'utf8').slice(0, MAX_GEMINI_KNOWLEDGE_CHARS);
                console.log('Gemini: knowledge from file', resolved, `(${geminiKnowledgeAppend.length} chars)`);
            } else {
                console.warn('Gemini: GEMINI_KNOWLEDGE_MD_PATH not a readable file:', resolved);
            }
        } else {
            const dirRaw =
                GEMINI_KNOWLEDGE_DIR != null && String(GEMINI_KNOWLEDGE_DIR).trim() !== ''
                    ? String(GEMINI_KNOWLEDGE_DIR).trim()
                    : 'knowledge';
            const dirAbs = resolveProjectPath(dirRaw);
            if (!dirAbs) {
                console.warn('Gemini: GEMINI_KNOWLEDGE_DIR must stay under project root; ignored.');
            } else {
                const files = collectTextKnowledgeFiles(dirAbs);
                if (files.length) {
                    geminiKnowledgeAppend = readFilesConcatForGemini(files);
                    console.log(
                        'Gemini: knowledge from',
                        files.length,
                        'file(s) under',
                        dirAbs,
                        `(${geminiKnowledgeAppend.length} chars)`
                    );
                } else {
                    console.warn('Gemini: no .md or .txt files found under', dirAbs);
                }
            }
        }
    } catch (e) {
        console.warn('Gemini: could not load knowledge:', e.message);
    }
}

/**
 * Convert OpenAI-style chat messages to Gemini generateContent payload.
 * @param {Array<{role:string,content:string}>} messages
 * @param {string} extraSystemAppend
 */
function buildGeminiGenerateBody(messages, extraSystemAppend) {
    let systemText = '';
    const contents = [];
    for (const m of messages || []) {
        const role = m.role;
        const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '');
        if (role === 'system') {
            systemText += (systemText ? '\n\n' : '') + text;
            continue;
        }
        if (role === 'user') {
            contents.push({ role: 'user', parts: [{ text }] });
        } else if (role === 'assistant') {
            contents.push({ role: 'model', parts: [{ text }] });
        }
    }
    if (extraSystemAppend) {
        systemText += (systemText ? '\n\n' : '') + extraSystemAppend;
    }
    const body = { contents };
    if (systemText.trim()) {
        body.systemInstruction = { parts: [{ text: systemText.trim() }] };
    }
    return body;
}

function geminiModelIdFromEnvOrRequest(requestedModel) {
    const fromEnv = (LLM_DEFAULT_MODEL || '').replace(/^models\//, '');
    const fromReq = (requestedModel || '').replace(/^models\//, '');
    if (fromReq && fromReq.toLowerCase().includes('gemini')) return fromReq;
    if (fromEnv && fromEnv.toLowerCase().includes('gemini')) return fromEnv;
    return 'gemini-2.5-flash';
}

async function proxyLlmToGemini(model, messages, res) {
    if (!GEMINI_API_KEY) {
        res.status(500).json({
            error: 'Gemini selected (LLM_PROVIDER=gemini) but GEMINI_API_KEY is not set.',
            details:
                'On the computer running the server: copy .env.example to .env in the app folder, set GEMINI_API_KEY (Google AI Studio), save, and restart node server.js. Or set LLM_PROVIDER=openai with LLM_API_URL and LLM_API_KEY for an OpenAI-compatible proxy.',
        });
        return;
    }
    const modelId = geminiModelIdFromEnvOrRequest(model);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        modelId
    )}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
    const extra = geminiKnowledgeAppend ? `\n\n--- Reference material ---\n${geminiKnowledgeAppend}` : '';
    const body = buildGeminiGenerateBody(messages, extra);
    if (!body.contents || !body.contents.length) {
        res.status(400).json({ error: 'Gemini: no user/model turns to send (empty conversation).' });
        return;
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const rawText = await response.text();
    let data;
    try {
        data = JSON.parse(rawText);
    } catch {
        throw new Error(`Gemini non-JSON response (${response.status}): ${rawText.slice(0, 500)}`);
    }
    if (!response.ok) {
        const msg = data?.error?.message || rawText;
        throw new Error(`Gemini API ${response.status}: ${msg}`);
    }
    const promptBlock = data?.promptFeedback?.blockReason;
    if (promptBlock) {
        throw new Error(`Gemini blocked the prompt (${promptBlock}).`);
    }
    if (!data?.candidates?.length) {
        throw new Error('Gemini returned no candidates (check API key, billing, and model id).');
    }
    const text =
        data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') ||
        data?.candidates?.[0]?.content?.parts?.[0]?.text ||
        '';
    const finish = data?.candidates?.[0]?.finishReason;
    if (!text && finish === 'SAFETY') {
        throw new Error('Gemini returned no text (output SAFETY).');
    }
    if (!text) {
        throw new Error(`Gemini returned empty text (finishReason=${finish || 'unknown'}).`);
    }
    const openAiShaped = {
        id: data?.responseId || 'gemini-chat',
        object: 'chat.completion',
        model: modelId,
        choices: [
            {
                index: 0,
                finish_reason: 'stop',
                message: { role: 'assistant', content: text },
            },
        ],
    };
    res.json(openAiShaped);
}

app.get('/proxy/nypl', async (req, res) => {
    try {
        const { q } = req.query;
        const url = `${NYPL_API_URL}/items/search?q=${encodeURIComponent(q)}&publicDomainOnly=true&per_page=10`;
        console.log('NYPL proxy: Fetching from URL:', url);
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Token token="${NYPL_TOKEN}"`,
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`NYPL API responded with status: ${response.status}`);
        }
        
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('NYPL proxy error:', error);
        res.status(500).json({ error: 'Failed to fetch from NYPL API' });
    }
});

app.get('/proxy/openverse', async (req, res) => {
    try {
        const { q } = req.query;
        const url = `https://api.openverse.engineering/v1/images/?q=${encodeURIComponent(q)}&license_type=commercial,modification&page_size=20&format=json`;
        console.log('Openverse proxy: Fetching from URL:', url);
        
        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Openverse API responded with status: ${response.status}`);
        }
        
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Openverse proxy error:', error);
        res.status(500).json({ error: 'Failed to fetch from Openverse API' });
    }
});

app.get('/proxy/europeana', async (req, res) => {
    try {
        const { q } = req.query;
        const url = `https://api.europeana.eu/record/v2/search.json?wskey=${EUROPEANA_API_KEY}&query=${encodeURIComponent(q)}&reusability=open&qf=IMAGE&rows=10`;
        console.log('Europeana proxy: Fetching from URL:', url);
        
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Europeana API responded with status: ${response.status}`);
        }
        
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Europeana proxy error:', error);
        res.status(500).json({ error: 'Failed to fetch from Europeana API' });
    }
});

app.get('/proxy/commons', async (req, res) => {
    try {
        const { q } = req.query;
        // iiurlwidth → thumburl / thumbwidth / thumbheight (client must not guess /commons/thumb/… URLs)
        const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(q)}&prop=imageinfo&iiprop=url|extmetadata|user|dimensions&iiurlwidth=400&format=json&origin=*&gsrlimit=10`;
        console.log('Commons proxy: Fetching from URL:', url);
        
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Commons API responded with status: ${response.status}`);
        }
        
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Commons proxy error:', error);
        res.status(500).json({ error: 'Failed to fetch from Commons API' });
    }
});

app.get('/proxy/smithsonian', async (req, res) => {
    try {
        const { q } = req.query;
        const url = `https://api.si.edu/openaccess/api/v1.0/search?api_key=${SMITHSONIAN_API_KEY}&q=${encodeURIComponent(q)}&rows=10&type=edanmdm&unit=NMAAHC`;
        console.log('Smithsonian proxy: Fetching from URL:', url);
        
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Smithsonian API responded with status: ${response.status}`);
        }
        
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Smithsonian proxy error:', error);
        res.status(500).json({ error: 'Failed to fetch from Smithsonian API' });
    }
});

app.get('/proxy/cleveland', async (req, res) => {
    try {
        const { q, limit = 10 } = req.query;
        const url = `https://openaccess-api.clevelandart.org/api/artworks/?q=${encodeURIComponent(q || '')}&has_image=1&limit=${Math.min(Number(limit) || 10, 50)}`;
        console.log('Cleveland Museum proxy: Fetching from URL:', url);

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Cleveland Museum API responded with status: ${response.status}`);
        }

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Cleveland Museum proxy error:', error);
        res.status(500).json({ error: 'Failed to fetch from Cleveland Museum of Art API' });
    }
});

// Local publication set: static files + keyword search from images-publication.xlsx
app.use(
    '/publication-media',
    (req, res, next) => {
        if (/\.xlsx$/i.test(req.path) || /\.json$/i.test(req.path) || /\.lock$/i.test(req.path)) {
            return res.status(404).end();
        }
        return next();
    },
    express.static(PUBLICATION_DIR, { index: false, dotfiles: 'deny' })
);

app.get('/proxy/publication', (req, res) => {
    try {
        const q = (req.query.q || '').toString();
        const catalog = loadPublicationCatalog();
        /** Path-only URLs so the browser resolves them on the app origin (webpack proxies /publication-media → this server). */
        const basePath = '/publication-media';
        const images = [];
        const seen = new Set();
        for (const row of catalog) {
            if (!publicationKeywordsMatch(row.keywords, q)) continue;
            const filename = resolvePublicationFileOnDisk(row.imageName);
            if (!filename || seen.has(filename)) continue;
            seen.add(filename);
            const imageUrl = `${basePath}/${encodeURIComponent(filename)}`;
            const title =
                row.description ||
                row.videoName ||
                filename.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
            images.push({
                source: 'publication',
                title,
                thumbnailUrl: imageUrl,
                fullUrl: imageUrl,
                license: row.description && row.description.length > 40 ? 'See caption / attribution' : '',
                localPublication: true,
            });
        }
        res.json({ images });
    } catch (error) {
        console.error('Publication proxy error:', error);
        res.status(500).json({ error: 'Failed to load publication images', images: [] });
    }
});

/** Public meta for the browser (no secrets): which provider and default model the server uses. */
app.get('/api/llm-meta', (req, res) => {
    res.json({
        provider: LLM_PROVIDER === 'gemini' ? 'gemini' : 'openai-compatible',
        defaultModel:
            LLM_PROVIDER === 'gemini'
                ? geminiModelIdFromEnvOrRequest(null)
                : resolveOpenAiCompatibleProxyModel(null),
    });
});

// LLM API proxy endpoint
app.post('/proxy/llm', async (req, res) => {
    try {
        const { model, messages } = req.body;

        console.log('LLM proxy: Received request for model:', model);
        console.log('LLM proxy: Messages:', messages);

        if (LLM_PROVIDER === 'gemini') {
            await proxyLlmToGemini(model, messages, res);
            return;
        }

        if (!LLM_API_URL || !LLM_API_KEY) {
            res.status(500).json({
                error: 'OpenAI-compatible LLM not configured',
                details:
                    'Set LLM_PROVIDER=openai with LLM_API_URL and LLM_API_KEY in .env, or use LLM_PROVIDER=gemini with GEMINI_API_KEY.',
            });
            return;
        }

        const resolvedModel = resolveOpenAiCompatibleProxyModel(model);
        if (resolvedModel !== (model || '').trim()) {
            console.warn(
                'LLM proxy: OpenAI-compatible backend — replaced client model',
                JSON.stringify(model),
                '→',
                resolvedModel
            );
        }

        const response = await fetch(LLM_API_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${LLM_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: resolvedModel,
                messages: messages,
            }),
        });

        console.log('LLM proxy: Response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('LLM proxy: API error:', errorText);
            throw new Error(`LLM API responded with status: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log('LLM proxy: Response data:', data);
        res.json(data);
    } catch (error) {
        console.error('LLM proxy error:', error);
        res.status(500).json({
            error: 'Failed to fetch from LLM API',
            details: error.message,
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

/** Anonymous visitor feedback (append-only JSON lines; no IP or identity stored). */
const FEEDBACK_LOG = path.join(__dirname, 'data', 'feedback.jsonl');

app.post('/api/feedback', (req, res) => {
    try {
        const raw = req.body && typeof req.body.message === 'string' ? req.body.message : '';
        const message = raw.trim();
        if (message.length < 1 || message.length > 8000) {
            return res.status(400).json({ ok: false, error: 'Message must be 1–8000 characters.' });
        }
        const line = `${JSON.stringify({ ts: new Date().toISOString(), message })}\n`;
        fs.mkdirSync(path.dirname(FEEDBACK_LOG), { recursive: true });
        fs.appendFileSync(FEEDBACK_LOG, line, 'utf8');
        res.json({ ok: true });
    } catch (e) {
        console.error('Feedback write error:', e);
        res.status(500).json({ ok: false, error: 'Could not save feedback.' });
    }
});

/** Production: serve webpack output from dist/ (same origin as /proxy and /publication-media). */
const DIST_DIR = path.join(__dirname, 'dist');
if (fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
    app.use(express.static(DIST_DIR));
    app.get('/*', (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        // Do not swallow API / proxy routes if they were registered out of order or an old build is running.
        if (req.path.startsWith('/api/') || req.path.startsWith('/proxy')) return next();
        res.sendFile(path.join(DIST_DIR, 'index.html'));
    });
}

// Error-handling middleware (must be registered after routes; only runs on `next(err)`).
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

function logBrowserUrls(port, host) {
    console.log(`  Local:   http://127.0.0.1:${port}/`);
    const showLan = host === '0.0.0.0' || host === '::' || host === '';
    if (!showLan) return;
    try {
        for (const list of Object.values(os.networkInterfaces())) {
            for (const net of list || []) {
                const v4 = net.family === 'IPv4' || net.family === 4;
                if (v4 && !net.internal) {
                    console.log(`  Network: http://${net.address}:${port}/`);
                }
            }
        }
    } catch (_) {
        /* ignore */
    }
}

// Modified server startup code with better error handling
const startServer = (port, host) => {
    const server = app.listen(port, host)
        .on('listening', () => {
            console.log(`Server listening on ${host}:${port}`);
            logBrowserUrls(port, host);
            console.log(`Using NYPL API URL: ${NYPL_API_URL}`);
            console.log('Token available:', !!NYPL_TOKEN);
            try {
                const n = loadPublicationCatalog().length;
                console.log(`Publication images index: ${n} entr${n === 1 ? 'y' : 'ies'} (images-publication)`);
            } catch (e) {
                console.warn('Publication index not loaded:', e.message);
            }
        })
        .on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.error('\n========== PORT IN USE ==========');
                console.error(
                    `This server (your current .env, e.g. Gemini) could not bind to ${port}. It exited — but another process is still listening there.`
                );
                console.error(
                    'If you run `yarn start`, webpack proxies /proxy and /api to that port. You will talk to THAT old process (wrong LLM backend), not this repo’s server.'
                );
                console.error(`Free the port:  lsof -i :${port}   then stop the PID, or use  PORT=3002  for both server and webpack (see readme).`);
                console.error('================================\n');
                process.exit(1);
            } else {
                console.error('Server error:', err);
                process.exit(1);
            }
        });

    // Handle process termination
    process.on('SIGTERM', () => {
        console.log('SIGTERM received. Shutting down gracefully...');
        server.close(() => {
            console.log('Server closed');
            process.exit(0);
        });
    });

    process.on('SIGINT', () => {
        console.log('SIGINT received. Shutting down gracefully...');
        server.close(() => {
            console.log('Server closed');
            process.exit(0);
        });
    });
};

const PORT = Number(process.env.PORT) || 3001;
/** Bind all interfaces so Safari/Chrome on the Mac mini or other devices on the LAN can reach the app. Use HOST=127.0.0.1 for localhost-only. */
const HOST = (process.env.HOST && String(process.env.HOST).trim()) || '0.0.0.0';
startServer(PORT, HOST); 