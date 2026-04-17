module.exports = {
  apps: [
    {
      name: 'analytics-dashboard',
      script: 'server.js',
      interpreter: 'node',
      // Restart automatically on crash; don't restart if it exits cleanly
      autorestart: true,
      watch: false,
      // Restart if memory exceeds 512 MB
      max_memory_restart: '512M',
      // Environment variables for production — copy .env values here or use --env
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
};
