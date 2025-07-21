require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const FIREWORKS_API_URL = 'https://api.fireworks.ai/inference/v1/chat/completions';
const MODEL = 'accounts/fireworks/models/llama4-scout-instruct-basic';

app.post('/chat', async (req, res) => {
  const { userMessage } = req.body;
  console.log(userMessage);

  try {
    const response = await axios.post(FIREWORKS_API_URL, {
      model: MODEL,
      messages: [{ role: 'user', content: userMessage }],
      max_tokens: 300,
      temperature: 0.7,
    }, {
      headers: {
        Authorization: `Bearer ${process.env.FIREWORKS_API_KEY}`,
        'Content-Type': 'application/json',
      }
    });

    console.log(response.data);
    res.json({ botReply: response.data.choices[0].message.content.trim() });
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

app.post('/generate-image', async (req, res) => {
  const { prompt } = req.body;
  console.log('Image prompt:', prompt);

  try {
    const submitResponse = await axios.post(
      'https://api.fireworks.ai/inference/v1/workflows/accounts/fireworks/models/flux-kontext-pro',
      {
        model: 'accounts/fireworks/models/flux-kontext-pro',
        prompt,
        width: 512,
        height: 512,
        steps: 30,
        guidance_scale: 7,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.FIREWORKS_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const requestId = submitResponse.data.request_id;
    if (!requestId) {
      throw new Error('No request ID returned');
    }

    console.log('Request submitted with ID:', requestId);
    console.log('Initial submit response:', JSON.stringify(submitResponse.data, null, 2));

    const resultEndpoint = 'https://api.fireworks.ai/inference/v1/workflows/accounts/fireworks/models/flux-kontext-pro/get_result';
    const maxAttempts = 10;
    const initialDelay = 500;
    const maxDelay = 3000;
    let delayMs = initialDelay;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const resultResponse = await axios.post(
          resultEndpoint,
          { id: requestId },
          {
            headers: {
              Authorization: `Bearer ${process.env.FIREWORKS_API_KEY}`,
              'Content-Type': 'application/json',
            },
          }
        );

        const pollResult = resultResponse.data;
        const status = pollResult.status;
        console.log(`Polling attempt ${attempt + 1}: Status = ${status}`);

        if (['Ready', 'Complete', 'Finished'].includes(status)) {
          const imageData = pollResult.result?.sample;

          if (typeof imageData === 'string' && imageData.startsWith('http')) {
            res.status(200).json({ imageUrl: imageData });
            return;
          }
        }

        if (['Failed', 'Error', 'Task not found'].includes(status)) {
          throw new Error(`Generation failed: ${pollResult.details || 'Unknown error'}`);
        }

        await new Promise(resolve => setTimeout(resolve, delayMs));
        delayMs = Math.min(delayMs * 1.5, maxDelay);
      } catch (pollError) {
        throw pollError;
      }
    }

    throw new Error('Polling failed to return a successful result in time');
  } catch (error) {
    console.error('Final error in image generation:', error.message);
    res.status(500).json({
      error: 'Image generation failed',
      details: error.message,
      fullError: error.response?.data || null
    });
  }
});

app.listen(3000, () => {
  console.log('Server running at http://localhost:3000');
});
