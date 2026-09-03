export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method Not Allowed' });

    try {
        const { imagePrompt } = req.body;

        if (!imagePrompt) {
            return res.status(400).json({ success: false, message: 'Falta el prompt de la imagen' });
        }

        console.log("Procesando imagen con Pruna AI (Ideogram)...");
        
        // Payload construido estrictamente según el esquema de P-Image-Ideogram
   const payload = [{
            taskType: "imageInference",
            taskUUID: crypto.randomUUID(),
            positivePrompt: imagePrompt,
            model: "prunaai:p-image@ideogram", 
            width: 512,  // Mitad de resolución para ahorrar costos
            height: 512, // Imágenes cuadradas para diagramas
            outputType: "URL",
            numberResults: 1,
            settings: {
                enhancePrompt: false, 
                thinkingLevel: "high"
            }
        }];

        const runwareResponse = await fetch('https://api.runware.ai/v1', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${process.env.RUNWARE_API_KEY}` 
            },
            body: JSON.stringify(payload)
        });

        const rwData = await runwareResponse.json();
        
        console.log("Respuesta de Runware (Ideogram):", JSON.stringify(rwData));

        // Manejo de la estructura de error oficial
        if (rwData.errors && rwData.errors.length > 0) {
            console.error("Runware devolvió un error de validación:", rwData.errors);
            return res.status(500).json({ success: false, message: rwData.errors[0].message, details: rwData.errors });
        }

        // Manejo de la respuesta exitosa
        if (rwData && rwData.data && rwData.data[0] && rwData.data[0].imageURL) {
            return res.status(200).json({ 
                success: true, 
                imageUrl: rwData.data[0].imageURL 
            });
        } else {
            throw new Error("La API no devolvió una imagen válida.");
        }

    } catch (error) {
        console.error('Error generando imagen con Ideogram:', error);
        return res.status(500).json({ success: false, message: 'Error al generar ilustración.', error: error.message });
    }
}
