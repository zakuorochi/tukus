import sharp from 'sharp';

export default async function handler(req, res) {
    // 1. Configuración de cabeceras CORS (Intacto)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Manejo de la petición pre-flight de CORS
    if (req.method === 'OPTIONS') return res.status(200).end();

    // Solo permitir método POST
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method Not Allowed' });
    }

    try {
        const { image } = req.body;

        if (!image) {
            return res.status(400).json({ success: false, message: 'No se envió ninguna imagen' });
        }

        // Limpiar el string base64 por si viene con el prefijo "data:image/jpeg;base64," del frontend
        const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');

        // 2. Procesamiento de la imagen tipo "CamScanner" usando Sharp
        const processedBuffer = await sharp(imageBuffer)
            .grayscale() // Convierte a escala de grises
            .normalize() // Estira el contraste automáticamente (blancos más blancos, negros más negros)
            .linear(1.2, -10) // Ajuste fino de contraste (multiplicador) y brillo (offset)
            .sharpen({ sigma: 1, m1: 2, m2: 3, x1: 2, y2: 10, y3: 20 }) // Aumenta fuertemente la nitidez de los trazos de lápiz
            .jpeg({ quality: 80 }) // Lo convierte a JPEG ligero para no saturar la API de Gemini después
            .toBuffer();

        // Convertir de nuevo a Base64 para enviarlo al frontend
        const processedBase64 = `data:image/jpeg;base64,${processedBuffer.toString('base64')}`;

        // 3. Respuesta exitosa
        return res.status(200).json({
            success: true,
            image: processedBase64
        });

    } catch (error) {
        console.error('Error al procesar la imagen:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Error interno procesando la imagen',
            error: error.message 
        });
    }
}

// CORRECCIÓN CRÍTICA: Aumentar el límite de tamaño del body de Next.js
export const config = {
    api: {
        bodyParser: {
            sizeLimit: '4mb', // Permite cargas de hasta 4 Megabytes (el límite de Vercel Serverless es 4.5MB)
        },
    },
};
