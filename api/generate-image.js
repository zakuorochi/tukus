export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method Not Allowed' });

    try {
        const { images, grade, questionTypes } = req.body;

        if (!images || !Array.isArray(images) || images.length === 0) {
            return res.status(400).json({ success: false, message: 'Faltan las fotos del cuaderno para generar la lámina' });
        }

        console.log("Generando lámina gráfica con Meta Muse Image (Runware) a partir de fotos...");
        
        // Prompt adaptado para que Meta Muse lea directamente las fotos de referencia
        const positivePrompt = `Actúa como un diseñador gráfico educativo experto en material escolar para niños de ${grade || 3}° de primaria. 
Analiza detalladamente las imágenes de los cuadernos de referencia adjuntas y genera una única lámina visual limpia, educativa y atractiva que contenga exactamente 10 ejercicios matemáticos o geométricos basados en estos temas.
La lámina debe mostrar en la parte superior el área de problemas gráficos claros y, en la parte inferior, un recuadro claramente delimitado con línea punteada (apto para recortar con tijeras) que contenga la clave de respuestas de los ejercicios.`;

        const taskPayload = {
            taskType: "imageInference",
            taskUUID: crypto.randomUUID(),
            model: "meta:muse@image",
            positivePrompt: positivePrompt,
            width: 1344,  // 2K (3:4 ratio vertical ideal para láminas escolares)
            height: 1792,
            outputType: "URL",
            outputFormat: "JPG",
            numberResults: 1,
            settings: {
                imageSearch: true,
                shell: true,
                thinkingLevel: "high",
                webSearch: false
            }
        };

        // Inyectamos las fotos del cuaderno en 'inputs.referenceImages' para que Muse las analice por OCR/Visión
        taskPayload.inputs = {
            referenceImages: images.map(img => img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`)
        };

        const runwareResponse = await fetch('https://api.runware.ai/v1', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${process.env.RUNWARE_API_KEY}` 
            },
            body: JSON.stringify([taskPayload])
        });

        const rwData = await runwareResponse.json();
        console.log("Respuesta de Runware (Muse Image):", JSON.stringify(rwData));

        if (rwData.errors && rwData.errors.length > 0) {
            console.error("Error devuelto por Runware:", rwData.errors);
            return res.status(500).json({ success: false, message: rwData.errors[0].message, details: rwData.errors });
        }

        if (rwData && rwData.data && rwData.data[0] && (rwData.data[0].imageURL || rwData.data[0].url)) {
            const imageUrl = rwData.data[0].imageURL || rwData.data[0].url;
            return res.status(200).json({ 
                success: true, 
                imageUrl: imageUrl 
            });
        } else {
            throw new Error("La API de Runware no devolvió una URL de imagen válida.");
        }

    } catch (error) {
        console.error('Error generando lámina con Meta Muse:', error);
        return res.status(500).json({ success: false, message: 'Error al generar la lámina educativa.', error: error.message });
    }
}
