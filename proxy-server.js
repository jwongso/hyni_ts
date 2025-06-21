const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const PORT = 3001;

// Proxy endpoint for regular requests
app.post('/api/proxy/:provider', async (req, res) => {
    try {
        const { provider } = req.params;
        const { endpoint, headers, body } = req.body;

        console.log(`Proxying request to ${provider}: ${endpoint}`);
        console.log('Headers:', headers);

        // Make the actual API request
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('API Error:', errorText);
            return res.status(response.status).send(errorText);
        }

        const data = await response.json();
        res.json(data);

    } catch (error) {
        console.error('Proxy error:', error);
        res.status(500).json({
            error: error.message,
            details: error.stack
        });
    }
});

// Streaming proxy endpoint
app.post('/api/stream/:provider', async (req, res) => {
    try {
        const { provider } = req.params;
        const { endpoint, headers, body } = req.body;

        console.log(`Proxying streaming request to ${provider}: ${endpoint}`);

        // Set SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*');

        // Make the streaming request
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Stream API Error:', errorText);
            res.write(`data: ${JSON.stringify({ error: errorText })}\n\n`);
            res.end();
            return;
        }

        // Forward the stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            res.write(chunk);
        }

        res.end();

    } catch (error) {
        console.error('Stream proxy error:', error);
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
    }
});

app.listen(PORT, () => {
    console.log(`Proxy server running on http://localhost:${PORT}`);
    console.log('Ready to proxy requests to Claude API');
});
