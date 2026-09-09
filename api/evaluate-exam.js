import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method Not Allowed' });

    try {
        const { examImages, originalQuestions } = req.body;

        if (!examImages || !Array.isArray(examImages) || examImages.length === 0) {
            return res.status(400).json({ success: false, message: 'Faltan las fotos del examen resuelto' });
        }

        if (!originalQuestions || !Array.isArray(originalQuestions)) {
            return res.status(400).json({ success: false, message: 'Faltan las preguntas originales del examen' });
        }

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ 
            model: "gemini-3.1-flash-lite",
            generationConfig: { responseMimeType: "application/json" }
        });

        const imageParts = examImages.map(imgBase64 => ({
            inlineData: {
                data: imgBase64.replace(/^data:image\/\w+;base64,/, ''),
                mimeType: "image/jpeg"
            }
        }));

        const promptText = `
        Eres TUKUS Tutor, un profesor particular experto y empático.
        Analiza las fotos adjuntas del examen resuelto por el alumno y compáralas con la siguiente pauta de preguntas y respuestas correctas:
        ${JSON.stringify(originalQuestions)}

        Evalúa minuciosamente qué respuestas son correctas y cuáles incorrectas.
        Devuelve un objeto JSON estricto con esta estructura exacta sin caracteres Markdown:
        {
          "score": 80,
          "analysisText": "Breve párrafo motivador y analítico dirigido al alumno explicando su desempeño general.",
          "needsReinforcement": true,
          "weakTopics": ["Suma de fracciones", "Ángulos complementarios"]
        }
        
        Reglas:
        - "score": Calificación entera de 0 a 100.
        - "needsReinforcement": Debe ser true si la nota es menor a 85 o si cometió errores claros en conceptos clave; false si aprobó de forma excelente y está listo.
        - "weakTopics": Una lista de 1 a 3 temas o conceptos específicos donde el alumno demostró más fallos y requiere refuerzo (si needsReinforcement es false, puedes dejarlo como array vacío []).
        `;

        const result = await model.generateContent([promptText, ...imageParts]);
        const rawText = result.response.text();
        
        let parsedData;
        try {
            let jsonString = rawText.trim();
            const firstBrace = jsonString.indexOf('{');
            const lastBrace = jsonString.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1) {
                jsonString = jsonString.substring(firstBrace, lastBrace + 1);
            }
            parsedData = JSON.parse(jsonString.replace(/[\r\n]+/g, " "));
        } catch (parseError) {
            console.error("Error al parsear respuesta del Tutor:", rawText);
            return res.status(500).json({ success: false, message: 'Error procesando la evaluación del tutor.' });
        }

        return res.status(200).json({
            success: true,
            score: parsedData.score || 0,
            analysisText: parsedData.analysisText || "Evaluación completada.",
            needsReinforcement: !!parsedData.needsReinforcement,
            weakTopics: parsedData.weakTopics || []
        });

    } catch (error) {
        console.error('Error en TUKUS Tutor:', error);
        return res.status(500).json({ success: false, message: 'Error al evaluar el examen.', error: error.message });
    }
}

export const config = {
    api: { bodyParser: { sizeLimit: '4mb' }, responseLimit: false },
};
