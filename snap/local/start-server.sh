#!/bin/bash

# Ensure the shared writable common directory exists
mkdir -p $SNAP_COMMON

# Generate a custom Nginx configuration dynamically, expanding $SNAP paths
cat << EOF > $SNAP_COMMON/nginx.conf
worker_processes 1;
daemon off;
error_log /dev/stderr;
pid $SNAP_COMMON/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include $SNAP/etc/nginx/mime.types;
    default_type application/octet-stream;
    access_log /dev/stdout;

    server {
        listen 8080;
        root $SNAP/var/www/html;
        index index.html;

        # Critical for Angular HTML5 routing
        location / {
            try_files \$uri \$uri/ /index.html;
        }
    }
}
EOF

# Start Nginx using the packaged binary from inside the snap
exec $SNAP/usr/sbin/nginx -c $SNAP_COMMON/nginx.conf