'use strict';

const fs = require('node:fs').promises;
const path = require('node:path');
const crypto = require('node:crypto');
const multer = require('multer');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; 
const JPEG_HEADER = [0xff, 0xd8, 0xff];
const JPEG_FOOTER = [0xff, 0xd9];

const ALLOWED_MIME_TYPES = new Set(['image/jpeg']);
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg']);

(async () => {
    try {
        await require('node:fs').promises.mkdir(UPLOAD_DIR, { recursive: true });
    } catch (err) {
        console.error('Error creando directorio de uploads:', err);
    }
})();

const createUploadError = (message, statusCode = 400) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

const getExtension = (name) => path.extname(name || '').toLowerCase();

const fileFilter = (req, file, cb) => {
    const extension = getExtension(file.originalname);
    const isMimeValid = ALLOWED_MIME_TYPES.has(file.mimetype);
    const isExtValid = ALLOWED_EXTENSIONS.has(extension);

    if (!isMimeValid || !isExtValid) {
        return cb(createUploadError('Solo se permiten imágenes formato JPG/JPEG.'));
    }
    cb(null, true);
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}.jpg`)
});

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1, fields: 5 }
});

const removeUploadedFile = async (filePath) => {
    try {
        await fs.unlink(filePath);
    } catch (error) {
        console.error('Error eliminando archivo temporal:', error);
    }
};

const validateJpegSignature = async (req, res, next) => {
    if (!req.file) return next();

    const filePath = req.file.path;

    try {
        const buffer = await fs.readFile(filePath);

        const startsWithHeader = JPEG_HEADER.every((byte, index) => buffer[index] === byte);
        const endsWithFooter = JPEG_FOOTER.every((byte, index) => buffer[buffer.length - JPEG_FOOTER.length + index] === byte);

        if (!startsWithHeader || !endsWithFooter) {
            await removeUploadedFile(filePath);
            return next(createUploadError('El archivo no es una imagen JPG válida.'));
        }

        return next();
    } catch (error) {
        await removeUploadedFile(filePath);
        console.error('Error validando la imagen JPG:', error);
        return next(createUploadError('Error interno procesando la imagen.', 500));
    }
};

upload.validateUploadedImage = validateJpegSignature;
module.exports = upload;