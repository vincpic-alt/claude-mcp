/**
 * PM2 process file for the isolated Callin MCP connector.
 * Does not start or restart ExpressJs-API-production or LiveKit-Worker-production.
 *
 * Usage (production server):
 *   set -a; source /etc/callin-mcp.env; set +a
 *   pm2 start ecosystem.config.js --env production
 *   pm2 save
 */
module.exports = {
  apps: [
    {
      name: 'Callin-MCP-production',
      cwd: '/opt/callin-mcp',
      script: 'src/server.js',
      interpreter: 'node',
      // Prefer loading secrets from the environment (sourced from /etc/callin-mcp.env)
      // rather than embedding them here.
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      max_memory_restart: '256M',
      max_restarts: 20,
      min_uptime: '5s',
      kill_timeout: 5000,
      env_production: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: '3100',
      },
      error_file: '/var/log/callin-mcp/error.log',
      out_file: '/var/log/callin-mcp/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
  ],
};
