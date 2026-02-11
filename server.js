const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json()); // Add JSON parsing middleware

const NYPL_API_URL = 'https://api.repo.nypl.org/api/v2';
const NYPL_TOKEN = 'zdx9mfhnl5jbvlh8';
const EUROPEANA_API_KEY = 'jundompe';
const SMITHSONIAN_API_KEY = 'gB5QaUmCBhXfFdPYOKhL7qTp3KYmkHg1Wx5HTsou';
const LLM_API_URL = 'https://litellm.oit.duke.edu/v1/chat/completions';
const LLM_API_KEY = 'sk-dwAYbKw4KalzudSkQVcOWg';

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

app.get('/proxy/rijksmuseum', async (req, res) => {
    try {
        const { q } = req.query;
        const url = `https://www.rijksmuseum.nl/api/en/collection?key=4H77aGm4&q=${encodeURIComponent(q)}&imgonly=true&ps=10`;
        console.log('Rijksmuseum proxy: Fetching from URL:', url);
        
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Rijksmuseum API responded with status: ${response.status}`);
        }
        const data = await response.json();
        res.json(data.artObjects || []);
    } catch (error) {
        console.error('Rijksmuseum proxy error:', error);
        res.status(500).json({ error: 'Failed to fetch from Rijksmuseum API' });
    }
});

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
        const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(q)}&prop=imageinfo&iiprop=url|extmetadata|user|dimensions&format=json&origin=*&gsrlimit=10`;
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

// LLM API proxy endpoint
app.post('/proxy/llm', async (req, res) => {
    try {
        const { model, messages } = req.body;
        
        console.log('LLM proxy: Received request for model:', model);
        console.log('LLM proxy: Messages:', messages);
        
        const response = await fetch(LLM_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${LLM_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model || 'gpt-4o',
                messages: messages
            })
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
            details: error.message 
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Modified server startup code with better error handling
const startServer = (port) => {
    const server = app.listen(port)
        .on('listening', () => {
            console.log(`Proxy server running on port ${port}`);
            console.log(`Using NYPL API URL: ${NYPL_API_URL}`);
            console.log('Token available:', !!NYPL_TOKEN);
        })
        .on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.log(`Port ${port} is busy, trying ${port + 1}`);
                startServer(port + 1);
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

startServer(3001); 