# Padel Analytics — análisis histórico web

Versión web estática del módulo `analisis_historico.py`, preparada para publicarse en GitHub Pages y verse correctamente desde computador o celular.

## Publicar por primera vez

1. Crea un repositorio nuevo en GitHub, por ejemplo `padel-analytics`.
2. Copia en el repositorio todo el contenido de esta carpeta.
3. Reemplaza `data/consolidado_padel.csv` por tu CSV histórico.
4. Sube los archivos a la rama `main`.
5. En GitHub abre **Settings → Pages**.
6. En **Build and deployment → Source**, selecciona **GitHub Actions**.
7. Abre la pestaña **Actions** y espera que termine el flujo `Publicar Padel Analytics`.

La dirección quedará con este formato:

```text
https://TU_USUARIO.github.io/padel-analytics/
```

## Actualizar los datos

Cada vez que reemplaces `data/consolidado_padel.csv` y hagas `git push`, GitHub ejecutará automáticamente:

```bash
python scripts/generar_datos_web.py
```

El script valida el CSV y genera `docs/data/events.json`, que es el archivo consumido por la web.

## Columnas reconocidas

Principales:

- `fecha` o `match_date`
- `partido` o `match_id`
- `player`
- `event_type`
- `shot_type`
- `forced_by_player`
- `point_type`
- `set` o `Set`
- `reves_1`, `drive_1`, `reves_2`, `drive_2`
- `dupla_1`, `dupla_2`

Los nombres de columnas no distinguen entre mayúsculas y minúsculas. El CSV puede estar separado por coma o punto y coma.

## Fórmula del Score / 100

```text
Score = 4 × Winners + 3 × Errores provocados − 2 × Errores forzados − 5 × Errores no forzados
Score / 100 = Score / puntos jugados × 100
```

## Probar localmente

```bash
python scripts/generar_datos_web.py
python -m http.server 8000 --directory docs
```

Luego abre `http://localhost:8000`.

## Privacidad

GitHub Pages es público. El generador sólo exporta las columnas deportivas necesarias, pero los nombres y eventos incluidos en `docs/data/events.json` podrán ser consultados por cualquier visitante.

