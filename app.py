import os
import sqlite3
from flask import Flask, render_template, request, jsonify
from werkzeug.utils import secure_filename
from datetime import datetime

app = Flask(__name__)

# --- CONFIGURACIÓN ---
# Obtiene la ruta absoluta de la carpeta donde está este archivo
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Define la carpeta de uploads dentro de static
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'static', 'uploads')
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Crea la carpeta de uploads automáticamente si no existe
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# --- BASE DE DATOS ---
def get_db_connection():
    conn = sqlite3.connect('database.db')
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    c = conn.cursor()
    # Crea la tabla si no existe
    c.execute('''CREATE TABLE IF NOT EXISTS files
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  title TEXT,
                  description TEXT,
                  type TEXT,
                  content TEXT,
                  filename TEXT,
                  date TEXT)''')
    conn.commit()
    conn.close()

# Inicializamos la DB al arrancar el programa
init_db()

# --- RUTAS ---
@app.route('/')
def index():
    return render_template('index.html')

# API: Obtener todos los archivos (GET)
@app.route('/api/files', methods=['GET'])
def get_files():
    conn = get_db_connection()
    files = conn.execute('SELECT * FROM files ORDER BY id DESC').fetchall()
    conn.close()
    # Convierte los datos de la DB a una lista de diccionarios JSON
    return jsonify([dict(ix) for ix in files])

# API: Subir archivo o link (POST)
@app.route('/upload', methods=['POST'])
def upload_file():
    title = request.form.get('title')
    desc = request.form.get('description')
    file_type = request.form.get('type')
    
    content = ""
    filename = ""
    db_type = 'doc' # Valor por defecto
    
    if file_type == 'link':
        content = request.form.get('url')
        db_type = 'link'
    else:
        if 'file' not in request.files:
            return jsonify({'error': 'No file part'}), 400
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No selected file'}), 400
        
        filename = secure_filename(file.filename)
        # Agregamos timestamp para que el nombre sea único
        unique_name = f"{int(datetime.now().timestamp())}_{filename}"
        
        # Guardar el archivo físicamente
        file.save(os.path.join(app.config['UPLOAD_FOLDER'], unique_name))
        
        # Guardar la ruta relativa para el HTML
        content = f"/static/uploads/{unique_name}"
        
        # Determinar tipo de archivo para el icono
        ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
        if ext in ['jpg', 'jpeg', 'png', 'gif', 'webp']:
            db_type = 'img'
        elif ext == 'pdf':
            db_type = 'pdf'

    # Guardar en Base de Datos SQLite
    conn = get_db_connection()
    date_now = datetime.now().strftime("%d/%m/%Y")
    conn.execute('INSERT INTO files (title, description, type, content, filename, date) VALUES (?, ?, ?, ?, ?, ?)',
                 (title, desc, db_type, content, filename, date_now))
    conn.commit()
    conn.close()

    return jsonify({'success': True})

# API: Eliminar archivo (DELETE) - VERSIÓN ROBUSTA
@app.route('/delete/<int:file_id>', methods=['DELETE'])
def delete_file(file_id):
    try:
        conn = get_db_connection()
        # 1. Obtener datos del archivo antes de borrarlo
        file = conn.execute('SELECT content, type FROM files WHERE id = ?', (file_id,)).fetchone()
        
        if file:
            # 2. Intentar borrar el archivo físico (si existe y no es un link)
            if file['type'] != 'link':
                try:
                    # Quitamos el primer '/' para que os.path construya bien la ruta
                    # Ejemplo: "/static/uploads/foto.jpg" -> "static/uploads/foto.jpg"
                    relative_path = file['content'].lstrip('/')
                    file_path = os.path.join(BASE_DIR, relative_path)
                    
                    if os.path.exists(file_path):
                        os.remove(file_path) # Borra el archivo físico
                except Exception as e:
                    print(f"Advertencia: No se pudo borrar archivo físico: {e}")

            # 3. Borrar de la base de datos (Esto es lo más importante para que desaparezca el cuadro)
            conn.execute('DELETE FROM files WHERE id = ?', (file_id,))
            conn.commit()
            conn.close()
            
            return jsonify({'success': True})
        else:
            conn.close()
            return jsonify({'error': 'Archivo no encontrado'}), 404

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)