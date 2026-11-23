const { resetAndSeed } = require('./reset_and_seed');

async function seedDatabase() {
  await resetAndSeed();
}

if (require.main === module) {
  seedDatabase().catch(err => {
    console.error('[Seed Error]:', err);
    process.exit(1);
  });
}

module.exports = { seedDatabase };


