import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';
import 'dotenv/config';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { gateway } from 'ai';

function getAgentModel() {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  const customBaseUrl = process.env.OPENAI_BASE_URL;

  if (geminiKey) {
    const google = createGoogleGenerativeAI({ apiKey: geminiKey });
    return google(process.env.AI_MODEL_NAME || 'gemini-2.0-flash');
  }

  if (openaiKey) {
    const openai = createOpenAI({ apiKey: openaiKey, baseURL: customBaseUrl });
    return openai(process.env.AI_MODEL_NAME || 'gpt-4o-mini');
  }

  if (anthropicKey) {
    const anthropic = createAnthropic({ apiKey: anthropicKey });
    return anthropic(process.env.AI_MODEL_NAME || 'claude-3-5-sonnet-20241022');
  }

  if (openrouterKey) {
    const openrouter = createOpenAICompatible({
      name: 'openrouter',
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: openrouterKey,
    });
    return openrouter(process.env.AI_MODEL_NAME || 'openai/gpt-4o-mini');
  }

  if (customBaseUrl) {
    const custom = createOpenAICompatible({
      name: 'custom',
      baseURL: customBaseUrl,
      apiKey: process.env.CUSTOM_API_KEY || 'dummy-key',
    });
    return custom(process.env.AI_MODEL_NAME || 'default');
  }

  return gateway(process.env.AI_MODEL_NAME || 'openai/gpt-4o-mini');
}

export default {
  agents: {
    default: {
      model: getAgentModel(),
      system: 'You are an expert QA testing agent for the Salon-Spa Booking system. You test workflows accurately and verify all UI outcomes.',
    },
  },

  targets: [
    {
      name: 'chromium',
      engine: web({
        browser: 'chromium',
        viewport: { width: 1280, height: 800 },
      }),
      app: {
        url: process.env.APP_URL ?? 'http://127.0.0.1:5173',
        command: {
          executable: 'npm',
          args: ['run', 'dev:frontend'],
          reuseExisting: true,
          startupTimeout: 20_000,
          log: '.e2e/logs/frontend.log',
        },
      },
    },
  ],
} satisfies E2EConfig;
