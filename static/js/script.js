// Cargar archivos al iniciar la página
document.addEventListener('DOMContentLoaded', loadFiles);

const uploadForm = document.getElementById('uploadForm');
const gallery = document.getElementById('gallery');
const inputContainer = document.getElementById('inputContainer');
const urlContainer = document.getElementById('urlContainer');
const fileInput = document.getElementById('fileInput');
const urlInput = document.getElementById('urlInput');

// Alternar entre subir archivo o link
function toggleInputType() {
    const isFile = document.querySelector('input[name="fileType"]:checked').value === 'file';
    if(isFile) {
        inputContainer.classList.remove('hidden');
        urlContainer.classList.add('hidden');
        fileInput.required = true;
        urlInput.required = false;
    } else {
        inputContainer.classList.add('hidden');
        urlContainer.classList.remove('hidden');
        fileInput.required = false;
        urlInput.required = true;
    }
}

// Función para cargar archivos desde la API de Flask
async function loadFiles() {
    gallery.innerHTML = ''; // Limpiar galería
    try {
        const response = await fetch('/api/files');
        const files = await response.json();
        files.forEach(file => createCard(file));
    } catch (error) {
        console.error("Error cargando archivos:", error);
    }
}

// Manejar el envío del formulario
uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.querySelector('.btn-submit');
    const originalText = btn.textContent;
    btn.textContent = "Subiendo...";
    btn.disabled = true;

    const formData = new FormData();
    const type = document.querySelector('input[name="fileType"]:checked').value;
    
    formData.append('title', document.getElementById('title').value);
    formData.append('description', document.getElementById('description').value);
    formData.append('type', type);

    if (type === 'file') {
        formData.append('file', fileInput.files[0]);
    } else {
        formData.append('url', urlInput.value);
    }

    try {
        const res = await fetch('/upload', { method: 'POST', body: formData });
        if (res.ok) {
            uploadForm.reset();
            toggleInputType();
            loadFiles(); // Recargar la lista para ver el nuevo
        } else {
            alert("Error al subir el archivo");
        }
    } catch (error) {
        console.error(error);
        alert("Error de conexión");
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
});

// Generador de Miniatura PDF (Lado del cliente con PDF.js)
async function generatePDFThumbnail(url, imgElement) {
    try {
        const pdf = await pdfjsLib.getDocument(url).promise;
        const page = await pdf.getPage(1); // Página 1
        
        const scale = 1.0;
        const viewport = page.getViewport({ scale });
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: context, viewport: viewport }).promise;
        
        imgElement.src = canvas.toDataURL();
        imgElement.style.opacity = '0.6';
    } catch (e) {
        console.log("No se pudo generar preview PDF:", e);
    }
}

// Crear la tarjeta HTML para cada archivo
function createCard(file) {
    const card = document.createElement('div');
    card.className = 'file-card';
    
    // Botón de eliminar (LÓGICA MEJORADA)
    const delBtn = document.createElement('button');
    delBtn.innerHTML = '<i class="ri-delete-bin-line"></i>';
    delBtn.className = 'delete-btn-card';
    
    delBtn.onclick = async (e) => {
        e.stopPropagation(); // Evitar abrir el modal
        
        if(confirm("¿Estás seguro de eliminar este recurso permanentemente?")) {
            try {
                const res = await fetch(`/delete/${file.id}`, { method: 'DELETE' });
                const data = await res.json();

                if (data.success) {
                    // EFECTO VISUAL: Desvanecer y eliminar el cuadro
                    card.style.transition = "all 0.5s ease";
                    card.style.opacity = "0";
                    card.style.transform = "scale(0.8)";
                    
                    setTimeout(() => {
                        card.remove(); // Elimina el HTML del recuadro
                    }, 500);
                } else {
                    alert("Error al eliminar: " + (data.error || "Desconocido"));
                }
            } catch (error) {
                console.error(error);
                alert("Error de conexión con el servidor");
            }
        }
    };

    let innerHTML = '';
    
    // CASO 1: IMAGEN
    if (file.type === 'img') {
        innerHTML = `
            <img src="${file.content}" class="card-bg-preview">
            <div class="card-overlay"></div>
            <div class="card-content">
                <div class="card-icon img-type"><i class="ri-image-line"></i></div>
                <div class="card-info">
                    <h3>${file.title}</h3>
                    <span class="file-tag">IMG</span>
                </div>
            </div>`;
    } 
    // CASO 2: PDF
    else if (file.type === 'pdf') {
        innerHTML = `
            <img src="" class="card-bg-preview pdf-thumb-${file.id}" style="opacity:0;">
            <div class="card-overlay"></div>
            <div class="card-content">
                <div class="card-icon pdf-type"><i class="ri-file-pdf-line"></i></div>
                <div class="card-info">
                    <h3>${file.title}</h3>
                    <span class="file-tag">PDF</span>
                </div>
            </div>`;
        
        // Generar miniatura después de crear el elemento
        setTimeout(() => {
            const img = card.querySelector(`.pdf-thumb-${file.id}`);
            generatePDFThumbnail(file.content, img);
        }, 100);
    } 
    // CASO 3: LINK
    else if (file.type === 'link') {
        innerHTML = `
            <div class="card-content">
                <div class="card-icon link-type"><i class="ri-links-line"></i></div>
                <div class="card-info">
                    <h3>${file.title}</h3>
                    <span class="file-tag">URL</span>
                </div>
            </div>`;
    } 
    // CASO 4: DOCUMENTO GENÉRICO
    else {
        innerHTML = `
            <div class="card-content">
                <div class="card-icon doc-type"><i class="ri-file-text-line"></i></div>
                <div class="card-info">
                    <h3>${file.title}</h3>
                    <span class="file-tag">DOC</span>
                </div>
            </div>`;
    }

    card.innerHTML = innerHTML;
    card.appendChild(delBtn);
    card.addEventListener('click', () => openModal(file));
    gallery.prepend(card);
}

// Lógica del Modal (Maximizar)
function openModal(file) {
    const overlay = document.getElementById('modalOverlay');
    const body = document.getElementById('modalBody');
    let content = '';

    if (file.type === 'img') {
        content = `<img src="${file.content}" class="modal-preview-img">`;
    } 
    else if (file.type === 'pdf') {
        content = `<iframe src="${file.content}" style="width:100%; height:500px; border:none; border-radius:8px;"></iframe>`;
    } 
    else if (file.type === 'link') {
        // Intentar detectar YouTube
        const ytMatch = file.content.match(/(?:youtu\.be\/|youtube\.com\/(?:.*v=|.*\/))([^&?]*)/);
        const ytId = ytMatch ? ytMatch[1] : null;

        if(ytId) {
            content = `<div class="video-container"><iframe src="https://www.youtube.com/embed/${ytId}" allowfullscreen></iframe></div>`;
        } else {
            content = `<div style="text-align:center; padding:30px;">
                <a href="${file.content}" target="_blank" style="background:#7dcfff; color:#1a1b26; padding:10px 20px; border-radius:5px; text-decoration:none; font-weight:bold;">
                    Visitar Enlace <i class="ri-external-link-line"></i>
                </a>
            </div>`;
        }
    } else {
        content = `<div style="text-align:center; padding:20px;">
            <i class="ri-file-text-line" style="font-size:4rem; color:#f7768e;"></i>
            <br><br>
            <a href="${file.content}" download style="color:#c0caf5;">Descargar Archivo</a>
        </div>`;
    }

    body.innerHTML = `
        ${content}
        <h2 style="color:#7dcfff; margin-top:20px;">${file.title}</h2>
        <div class="modal-desc">${file.description}</div>
        <div style="font-size:0.8rem; color:#565f89; margin-top:20px; border-top:1px solid rgba(255,255,255,0.1); padding-top:10px;">
            Fecha de Ingreso: ${file.date}
        </div>
    `;
    
    overlay.classList.remove('hidden');
    setTimeout(() => overlay.classList.add('active'), 10);
}

// Cerrar Modal
document.getElementById('closeModal').addEventListener('click', () => {
    const overlay = document.getElementById('modalOverlay');
    overlay.classList.remove('active');
    setTimeout(() => overlay.classList.add('hidden'), 300);
});