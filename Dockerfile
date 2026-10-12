FROM nginx:1.27-alpine

COPY deploy/nginx/nginx.conf /etc/nginx/nginx.conf
COPY deploy/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY deploy/site/ /usr/share/nginx/html/

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

# Bypass the stock entrypoint: the deployment is read-only and drops CAP_CHOWN.
ENTRYPOINT ["nginx", "-g", "daemon off;"]
