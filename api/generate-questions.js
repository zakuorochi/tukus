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
        Genera un total de 20 preguntas evaluativas para un estudiante de ${grade}° grado de primaria basándote en la materia identificada.
        Tipos de pregunta requeridos: ${questionTypes.join(', ')}.
        
        ${requestsImages ? `ATENCIÓN: El usuario pidió ejercicios gráficos.
        Debes organizar el examen de la siguiente manera:
        - Las primeras 5 preguntas (IDs 1 al 5) SERÁN VISUALES y deberán ser resueltas observando una hoja de trabajo generada.
        - Las 15 preguntas restantes (IDs 6 al 20) serán de texto tradicional.
        
        REGLAS PARA EL "masterImagePrompt" (LA HOJA A4):
        1. El prompt DEBE estar en INGLÉS, pidiendo un "A4 educational worksheet design, clean white background".
        2. Debe describir 5 ejercicios gráficos numerados (por ejemplo, triángulos, gráficos, sumas).
        3. PARA QUE EL TEXTO SALGA EN ESPAÑOL: Debes describir el texto usando la frase "with the exact text" y poner el texto en español entre comillas simples. Al estar apagado el 'enhancePrompt', la IA escribirá exactamente lo que esté entre comillas.
        Ejemplo: "An A4 educational worksheet. Exercise 1 shows a triangle with a 45 degree angle and the exact text '1. Halla el valor de X'. Exercise 2 shows a circle with the exact text '2. Ángulo central'."

        REGLA PARA EL JSON DE PREGUNTAS:
        - Para los IDs del 1 al 5, el 'statement' debe decir algo como: "Resuelve el ejercicio [ID] de la hoja de trabajo adjunta."
        - Para los IDs del 6 al 20, formula preguntas de texto normales basadas en los apuntes.` : ''}

        Devuelve un objeto JSON con esta estructura exacta sin caracteres Markdown:
        {
          "masterImagePrompt": "El prompt de la hoja A4 aquí en INGLÉS (solo si pidieron gráficos, sino vacío)",
          "questions": [
            {
              "id": 1,
              "type": "Opción Múltiple", 
              "statement": "El texto de la pregunta...",
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
            parsedData = JSON.parse(rawText);
        } catch (parseError) {
            console.error("Error al leer el JSON de Gemini. Texto crudo recibido:", rawText);
            return res.status(500).json({ success: false, message: 'La IA no devolvió un formato válido.', error: parseError.message });
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
