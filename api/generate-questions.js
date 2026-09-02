import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method Not Allowed' });

    try {
        const { images, grade, questionTypes } = req.body;

        if (!images || !images.length || !grade || !questionTypes) {
            return res.status(400).json({ success: false, message: 'Faltan parámetros' });
        }

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ 
            model: "gemini-3.1-flash-lite",
            generationConfig: { responseMimeType: "application/json" }
        });

        const imageParts = images.map(imgBase64 => ({
            inlineData: {
                data: imgBase64.replace(/^data:image\/\w+;base64,/, ''),
                mimeType: "image/jpeg"
            }
        }));

        const requestsImages = questionTypes.some(type => type.includes('Gráficos'));
       const promptText = `
        Eres un pedagogo experto. Analiza las fotos de los apuntes adjuntos.
        Identifica el tema principal y genera 20 preguntas evaluativas para un estudiante de ${grade}° grado de primaria.
        Tipos de pregunta requeridos: ${questionTypes.join(', ')}.

        ${requestsImages ? `ATENCIÓN: El usuario pidió ejercicios gráficos.
        Para al menos 5 preguntas, DEBES generar un gráfico vectorial en el campo "svgCode".
        
        REGLA CRÍTICA PARA EL SVG (LÓGICA Y ANTIFALLOS):
        1. NUNCA uses comillas dobles ("). Usa EXCLUSIVAMENTE COMILLAS SIMPLES (') para los atributos.
        2. Inicia SIEMPRE tu código con: <svg viewBox='0 0 300 150' xmlns='http://www.w3.org/2000/svg'>
        3. DIBUJA EL PROBLEMA COMPLETO: Si la pregunta es sobre una secuencia (ej. Triángulo, Círculo, Triángulo), NO dibujes una sola figura. Dibuja las TRES figuras separadas horizontalmente (ej. la primera en cx='50', la segunda en cx='150', la tercera en cx='250').
        4. Si es de fracciones, dibuja la figura completa y pinta las partes.
        5. El código debe ir en UNA SOLA LÍNEA sin saltos de línea (\\n).
        ` : ''}

        Devuelve un objeto JSON con esta estructura exacta sin caracteres Markdown:
        {
          "masterImagePrompt": "", 
          "questions": [
            {
              "id": 1,
              "type": "Opción Múltiple", 
              "statement": "El texto de la pregunta...",
              "svgCode": "<svg viewBox='0 0 300 150' xmlns='http://www.w3.org/2000/svg'><polygon points='50,20 20,80 80,80' fill='black'/><polygon points='150,20 120,80 180,80' fill='black'/></svg>", 
              "options": ["Opción A", "Opción B", "Opción C", "Opción D"],
              "answer": "La respuesta correcta"
            }
          ]
        }
        `;

console.log("Enviando petición a Gemini...");
        const result = await model.generateContent([promptText, ...imageParts]);
        const rawText = result.response.text();
        
        let parsedData;
        try {
            // Limpieza robusta: Extrae estrictamente lo que esté entre la primera llave y la última
            let jsonString = rawText.trim();
            const firstBrace = jsonString.indexOf('{');
            const lastBrace = jsonString.lastIndexOf('}');
            
            if (firstBrace !== -1 && lastBrace !== -1) {
                jsonString = jsonString.substring(firstBrace, lastBrace + 1);
            }
            
            // Reemplazos de seguridad para evitar saltos de línea ilegales en los SVG
            jsonString = jsonString.replace(/[\r\n]+/g, " ");

            parsedData = JSON.parse(jsonString);
        } catch (parseError) {
            console.error("Error al leer el JSON de Gemini. Texto crudo recibido:", rawText);
            return res.status(500).json({ 
                success: false, 
                message: 'La IA no devolvió un formato válido.',
                error: parseError.message 
            });
        }

        if (Array.isArray(parsedData)) {
            parsedData = { questions: parsedData, masterImagePrompt: null };
        } else if (!parsedData.questions) {
            parsedData.questions = [];
        }

        return res.status(200).json({ 
            success: true, 
            questions: parsedData.questions,
            masterImagePrompt: parsedData.masterImagePrompt || null
        });

    } catch (error) {
        console.error('Error general:', error);
        return res.status(500).json({ success: false, message: 'Error procesando la IA.', error: error.message });
    }
}

export const config = {
    api: { bodyParser: { sizeLimit: '4mb' }, responseLimit: false },
};
