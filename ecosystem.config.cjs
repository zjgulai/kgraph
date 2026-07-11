/**
 * PM2 Ecosystem Config — DocCanvas on Tencent Cloud Lightweight Server
 *
 * Usage:
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 *   pm2 startup
 */
module.exports = {
  apps: [
    {
      name: 'doccas',
      script: '.next/standalone/server.js',
      cwd: '/opt/doccanvas/current',
      env: {
        NODE_ENV: 'production',
        DOCUMENT_PATH_MODE: 'prod',
        DOCCANVAS_ROOT: '/var/lib/doccanvas',
        DOCCANVAS_WRITE_MODE: 'readonly',
        // To enable authenticated writes, change to:
        // DOCCANVAS_WRITE_MODE: 'owner',
        // DOCCANVAS_ADMIN_TOKEN: '<set-via-server-secret>',
        PORT: 3200,
        HOSTNAME: '127.0.0.1',
      },
      // Auto-restart on crash
      autorestart: true,
      max_restarts: 10,
      exp_backoff_restart_delay: 100,
      kill_timeout: 15_000,
      // Memory limit — soft restart at 500MB
      max_memory_restart: '500M',
      // Logging
      log_file: '/var/log/doccanvas/pm2-out.log',
      error_file: '/var/log/doccanvas/pm2-err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
