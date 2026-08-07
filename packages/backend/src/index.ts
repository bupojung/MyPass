import Fastify from 'fastify';

const fastify = Fastify({ logger: true });

fastify.get('/health', async () => ({ status: 'ok' }));

// Simple vault endpoints that store ciphertext in-memory (demo only)
const vaultStore: Record<string, any> = {};

fastify.get('/v1/vault/:userId', async (request, reply) => {
  const { userId } = request.params as any;
  return { items: vaultStore[userId] || [] };
});

fastify.post('/v1/vault/:userId', async (request, reply) => {
  const { userId } = request.params as any;
  const body = request.body as any;
  vaultStore[userId] = vaultStore[userId] || [];
  vaultStore[userId].push(body);
  return { ok: true };
});

const start = async () => {
  try {
    await fastify.listen({ port: 3000 });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
