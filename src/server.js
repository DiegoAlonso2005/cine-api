require('dotenv').config();

const express = require('express');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

app.use(express.json());

async function initializeDatabase() {
  let lastError;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS movies (
          id SERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          director TEXT NOT NULL,
          release_year INTEGER NOT NULL CHECK (release_year BETWEEN 1888 AND 2100),
          genre TEXT NOT NULL,
          synopsis TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      return;
    } catch (error) {
      lastError = error;
      console.log(`PostgreSQL aún no está disponible (intento ${attempt}/30): ${error.message}`);
      if (attempt < 30) await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  throw lastError;
}

async function seedMovies() {
  await pool.query(`
    INSERT INTO movies (id, title, director, release_year, genre, synopsis)
    SELECT seed.id, seed.title, seed.director, seed.release_year, seed.genre, seed.synopsis
    FROM (VALUES
      (1, 'Amores perros', 'Alejandro González Iñárritu', 2000, 'Drama', 'Tres historias se entrelazan en Ciudad de México.'),
      (2, 'Roma', 'Alfonso Cuarón', 2018, 'Drama', 'Una mirada íntima a la vida de una familia en la colonia Roma de Ciudad de México a principios de los años setenta.')
    ) AS seed(id, title, director, release_year, genre, synopsis)
    ON CONFLICT (id) DO NOTHING
  `);
  await pool.query(`
    SELECT setval(pg_get_serial_sequence('movies', 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM movies), 1), 1), true)
  `);
  await pool.query(`
    INSERT INTO movies (title, director, release_year, genre, synopsis)
    SELECT seed.title, seed.director, seed.release_year, seed.genre, seed.synopsis
    FROM (VALUES
      ('Y tu mamá también', 'Alfonso Cuarón', 2001, 'Drama', 'Dos amigos emprenden un viaje por carretera con una mujer mayor.'),
      ('El laberinto del fauno', 'Guillermo del Toro', 2006, 'Fantasía', 'Una niña descubre un mundo fantástico en la España de posguerra.'),
      ('Coco', 'Lee Unkrich', 2017, 'Animación', 'Miguel viaja al mundo de los muertos para descubrir la historia de su familia.'),
      ('Güeros', 'Alonso Ruizpalacios', 2014, 'Drama', 'Tres jóvenes recorren Ciudad de México durante una huelga estudiantil.'),
      ('Ya no estoy aquí', 'Fernando Frías', 2019, 'Drama', 'Un joven regiomontano lleva su cultura y su música hasta Nueva York.'),
      ('Temporada de patos', 'Fernando Eimbcke', 2004, 'Comedia', 'Una tarde en un departamento cambia para dos adolescentes y sus vecinos.'),
      ('Macario', 'Roberto Gavaldón', 1960, 'Fantasía', 'Un campesino recibe una oportunidad extraordinaria tras compartir su comida.'),
      ('No se aceptan devoluciones', 'Eugenio Derbez', 2013, 'Comedia dramática', 'Un hombre debe aprender a cuidar a una hija que acaba de conocer.')
    ) AS seed(title, director, release_year, genre, synopsis)
    WHERE NOT EXISTS (SELECT 1 FROM movies WHERE movies.title = seed.title)
  `);
  await pool.query(`
    SELECT setval(pg_get_serial_sequence('movies', 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM movies), 1), 1), true)
  `);
}

app.get('/', (_req, res) => {
  res.json({ name: 'Cine API', status: 'ok', docs: '/api/movies' });
});

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', database: 'disconnected' });
  }
});

app.get('/api/movies', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM movies ORDER BY id ASC'
    );
    res.json(rows);
  } catch (error) { next(error); }
});

app.get('/api/movies/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM movies WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Película no encontrada' });
    res.json(rows);
  } catch (error) { next(error); }
});

app.post('/api/movies', async (req, res, next) => {
  const { title, director, release_year, genre, synopsis = '' } = req.body;
  if (!title || !director || !release_year || !genre) {
    return res.status(400).json({ error: 'title, director, release_year y genre son obligatorios' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO movies (title, director, release_year, genre, synopsis)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [title, director, release_year, genre, synopsis]
    );
    res.status(201).json(rows[0]);
  } catch (error) { next(error); }
});

app.put('/api/movies/:id', async (req, res, next) => {
  const { title, director, release_year, genre, synopsis = '' } = req.body;
  if (!title || !director || !release_year || !genre) {
    return res.status(400).json({ error: 'title, director, release_year y genre son obligatorios' });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE movies SET title=$1, director=$2, release_year=$3, genre=$4, synopsis=$5
       WHERE id=$6 RETURNING *`,
      [title, director, release_year, genre, synopsis, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Película no encontrada' });
    res.json(rows[0]);
  } catch (error) { next(error); }
});

app.delete('/api/movies/:id', async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM movies WHERE id=$1', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Película no encontrada' });
    res.status(204).end();
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'Error interno del servidor' });
});

initializeDatabase()
  .then(seedMovies)
  .then(() => app.listen(port, '0.0.0.0', () => console.log(`Cine API lista en http://localhost:${port}`)))
  .catch((error) => { console.error('No se pudo iniciar la API:', error); process.exit(1); });

