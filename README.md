# Cine API — proyecto en tres partes

API de películas hecha con Node.js y Express. En local corren dos contenedores: `database` (PostgreSQL) y `movies` (la API). PostgreSQL guarda sus datos en el volumen persistente `cine_postgres_data`.

## Parte 1: local (Node.js + PostgreSQL en Docker)

Requisitos: Docker Desktop iniciado.

1. En esta carpeta, construye y levanta ambos contenedores:

   ```bash
   docker compose down --remove-orphans
   docker compose up -d --build
   docker compose ps
   ```

   `down --remove-orphans` recrea la red y limpia el contenedor PostgreSQL anterior que quedó de la configuración inicial; no borra el volumen. No agregues `-v`.

2. Espera hasta que `database` aparezca como `healthy` y `movies` como `Up`. Prueba la API en:

   - `http://localhost:3000/health`
   - `http://localhost:3000/api/movies`

La primera ejecución crea la tabla `movies`, agrega `Amores perros` con ID 1 y `Roma` con ID 2 para probar `GET /api/movies/2`, y carga más películas de ejemplo. Los ejemplos se agregan solo si no existe ya una película con el mismo título. El volumen `cine_postgres_data` conserva los datos al detener o recrear el contenedor. `docker compose down` detiene los servicios sin borrar el volumen. **No ejecutes `docker compose down -v` si quieres conservar los datos.** Las credenciales del compose son solo para desarrollo local. La API se conecta al servicio `database` dentro de la red privada de Compose.

## Parte 2: GitHub y Render

En GitHub crea un repositorio vacío llamado `cine-api` (no lo inicialices con README). Desde esta carpeta, publica el commit local:

```bash
git remote add origin https://github.com/DiegoAlonso2005/cine-api.git
git push -u origin main
```

`.env` y `node_modules` están excluidos por `.gitignore`. El archivo `render.yaml` define el servicio web Node, la base PostgreSQL, la conexión `DATABASE_URL` y la comprobación `/health`.

1. En Render, elige **New → Blueprint** y conecta el repositorio GitHub.
2. Revisa los recursos definidos en `render.yaml` y sincroniza el Blueprint.
3. Al terminar, abre la URL `onrender.com` de `cine-api` y verifica `/health`.

Este Blueprint usa planes gratuitos para la práctica. La base PostgreSQL gratuita de Render expira 30 días después de crearla; antes de esa fecha hay que actualizarla a un plan pagado o exportar los datos. El servicio web gratuito puede dormir cuando está inactivo. La base local de Docker y Render son independientes; los datos locales no se copian solos. No publiques `.env` ni credenciales.

## Parte 3: consumir la API desde n8n

En n8n agrega un nodo **HTTP Request**:

- Para consultar películas: Method `GET`, URL `https://TU-SERVICIO.onrender.com/api/movies`.
- Para agregar una: Method `POST`, URL `https://TU-SERVICIO.onrender.com/api/movies`, Send Body activado, Body Content Type `JSON`:

  ```json
  {
    "title": "Amores perros",
    "director": "Alejandro González Iñárritu",
    "release_year": 2000,
    "genre": "Drama",
    "synopsis": "Historias que se cruzan en Ciudad de México."
  }
  ```

- También están `GET /api/movies/:id`, `PUT /api/movies/:id` y `DELETE /api/movies/:id`.

Si n8n corre en Docker y quieres probar la API local desde ahí, `localhost` apunta al contenedor de n8n; usa `http://host.docker.internal:3000/api/movies` en Docker Desktop. Para la entrega/despliegue usa la URL pública de Render. Los servicios gratuitos de Render pueden tardar en responder al primer request tras un periodo inactivo.

