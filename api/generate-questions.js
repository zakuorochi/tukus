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
        Primero, clasifica el tema principal en: "CIENCIAS_MATEMATICAS" o "LETRAS_HUMANIDADES".
        Genera 20 preguntas evaluativas para un estudiante de ${grade}° grado de primaria.
        Tipos de pregunta requeridos: ${questionTypes.join(', ')}.

        ${requestsImages ? `ATENCIÓN: El usuario pidió apoyo gráfico.
        NO generes un prompt maestro. Evalúa cada pregunta individualmente para decidir si requiere una imagen en el campo "imagePrompt".

        REGLAS CRÍTICAS DE CANTIDAD Y NECESIDAD (CONTROL DE COSTOS):
        1. DEBES generar un mínimo de 1 y un MÁXIMO DE 5 "imagePrompt" en total para todo el examen.
        2. Las otras 15 a 19 preguntas DEBEN llevar obligatoriamente "imagePrompt": null.
        3. Solo asigna una imagen si es ESTRICTAMENTE NECESARIA para resolver el problema (ej. contar objetos, identificar un ángulo, diagramas visuales). Si se puede resolver solo leyendo el texto, usa null.

        REGLAS DE ESTILO DEL PROMPT (IDEOGRAM - EVITAR ALUCINACIONES):
        - El prompt debe estar en INGLÉS.
        - Fuerza siempre este estilo al inicio del prompt: "Flat icon style, minimalist vector, clean white background, simple educational illustration".
        - Evita fondos complejos, paisajes o elementos innecesarios.
        - NO incluyas textos dentro de la imagen a menos que sea obligatorio para el ejercicio. Si es vital, usa "with the exact text" y comillas simples.
        - Ejemplo ideal: "Flat icon style, minimalist vector, a green triangle with a 90 degree angle marked, clean white background".` : ''}

        Devuelve un objeto JSON con esta estructura exacta sin caracteres Markdown:
        {
          "subjectCategory": "CIENCIAS_MATEMATICAS",
          "questions": [
            {
              "id": 1,
              "type": "Opción Múltiple", 
              "statement": "El texto de la pregunta...",
              "imagePrompt": "Prompt en inglés con estilo icono o null",
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
