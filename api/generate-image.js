export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method Not Allowed' });

    try {
        const { images, questionsData, grade } = req.body;

        if (!questionsData || !Array.isArray(questionsData)) {
            return res.status(400).json({ success: false, message: 'Faltan los datos de los ejercicios' });
        }

        console.log("Generando lámina educativa con Meta Muse Image (Runware)...");
        
        // 1. Construcción del prompt pedagógico solicitando la plantilla con sección recortable
        const positivePrompt = `Actúa como un diseñador gráfico educativo experto en material escolar para niños de ${grade || 3}° de primaria. 
Toma como referencia los cuadernos adjuntos y genera una única lámina visual limpia y atractiva que contenga exactamente 10 ejercicios ilustrados basados en estos temas: ${JSON.stringify(questionsData)}.
La lámina debe mostrar en la parte superior el área de problemas con ilustraciones claras y, en la parte inferior, un recuadro delimitado en línea punteada (apto para recortar con tijeras) que contenga la clave con las respuestas de los ejercicios.`;

        // 2. Adaptación exacta al schema OpenAPI de Meta Muse Image
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

        // Si el usuario subió fotos del cuaderno escaneado, se inyectan en 'inputs.referenceImages'
        if (images && Array.isArray(images) && images.length > 0) {
            taskPayload.inputs = {
                referenceImages: images.map(img => img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`)
            };
        }

        // Runware requiere estrictamente un ARRAY raíz que contenga las tareas
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

        // Manejo de errores según el esquema OpenAPI ErrorResponse
        if (rwData.errors && rwData.errors.length > 0) {
            console.error("Error devuelto por Runware:", rwData.errors);
            return res.status(500).json({ success: false, message: rwData.errors[0].message, details: rwData.errors });
        }

        // Extracción de la URL de la imagen generada
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
