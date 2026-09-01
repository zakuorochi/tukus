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

        console.log("Procesando imagen con Runware FLUX...");
        const runwareResponse = await fetch('https://api.runware.ai/v1', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${process.env.RUNWARE_API_KEY}` 
            },
            body: JSON.stringify([{
                taskType: "imageInference",
                taskUUID: crypto.randomUUID(),
                positivePrompt: imagePrompt,
                model: "bfl-flux-2-klein-4b",
                width: 1024,
                height: 1024,
                outputType: ["URL"],
                numberResults: 1
            }])
        });

        const rwData = await runwareResponse.json();

        if (rwData && rwData.data && rwData.data[0] && rwData.data[0].imageURL) {
            return res.status(200).json({ 
                success: true, 
                imageUrl: rwData.data[0].imageURL 
            });
        } else {
            throw new Error("Runware no devolvió una URL válida.");
        }

    } catch (error) {
        console.error('Error generando imagen:', error);
        return res.status(500).json({ success: false, message: 'Error al generar ilustración.', error: error.message });
    }
}
