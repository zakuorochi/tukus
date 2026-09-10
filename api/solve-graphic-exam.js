import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method Not Allowed' });

    try {
        const { imageUrl, grade } = req.body;
        if (!imageUrl) return res.status(400).json({ success: false, message: 'Falta la imagen' });

        // Descargamos la imagen de Muse en el backend para dársela a Gemini
        const imageReq = await fetch(imageUrl);
        const buffer = await imageReq.arrayBuffer();
        const base64Image = Buffer.from(buffer).toString('base64');

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ 
            model: "gemini-3.1-flash-lite",
            generationConfig: { responseMimeType: "application/json" }
        });

        const promptText = `
        Eres un profesor de matemáticas de ${grade}. Lee la lámina de ejercicios adjunta.
        Resuelve los 10 problemas que aparecen en la imagen y devuelve las respuestas correctas.
        
        Devuelve estrictamente este JSON:
        {
          "answers": [
            { "id": 1, "answer": "Explicación breve o resultado final" }
          ]
        }
        `;

        const result = await model.generateContent([
            promptText, 
            { inlineData: { data: base64Image, mimeType: "image/jpeg" } }
        ]);

        const rawText = result.response.text();
        let parsedData = JSON.parse(rawText.substring(rawText.indexOf('{'), rawText.lastIndexOf('}') + 1).replace(/[\r\n]+/g, " "));

        return res.status(200).json({ success: true, answers: parsedData.answers });

    } catch (error) {
        console.error('Error resolviendo lámina gráfica:', error);
        return res.status(500).json({ success: false });
    }
}
