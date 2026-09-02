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
        Primero, identifica el tema principal (por ejemplo: Ciencias, Letras, MATEMÁTICAS).
        Genera 20 preguntas evaluativas para un estudiante de ${grade}° grado de primaria basándote en los apuntes.
        Tipos de pregunta requeridos: ${questionTypes.join(', ')}.
        
        ${requestsImages ? `ATENCIÓN: El usuario pidió ejercicios gráficos. NO pidas imágenes individuales. 
        Crea UN SOLO "masterImagePrompt" EN INGLÉS que describa una cuadrícula de 4 secciones (2x2 grid educational image). 
        
        REGLA ESPECIAL PARA MATEMÁTICAS:
        Si detectas que el tema involucra operaciones matemáticas, fracciones, geometría o problemas numéricos, DEBES usar la imagen para plantear el ejercicio visualmente (ej. figuras con medidas, tortas de fracciones, balanzas, o los números dibujados grandes). 
        Evita poner fórmulas o notación compleja en el texto JSON. En su lugar, apóyate en la imagen.
        Ejemplo de pregunta: "Observa el rectángulo de la Sección 1. ¿Cuál es su perímetro?"
        Ejemplo de masterImagePrompt matemático: "Section 1: A diagram of a green rectangle with the exact text 'Base: 8cm' and 'Height: 4cm'. Section 2: A pie chart showing 3/4 filled, with the exact text 'Fracción'."

        REGLA ESTRICTA PARA TEXTOS DENTRO DE LA IMAGEN:
        Como usaremos el motor Ideogram, tiene una capacidad tipográfica perfecta. Si necesitas que aparezca un texto, número o fórmula DENTRO de los paneles, DEBES indicarlo usando la frase "with the exact text" y ponerlo entre comillas simples.
        Ejemplo: "Section 1: A chalkboard with the exact text '25 x 4 =' written on it."
        
        Asegúrate de que al menos 4 de tus preguntas en el JSON hagan referencia a las secciones de esta imagen (Ejemplo: "Observa la sección 2 de la imagen. ¿Qué representa...?").` : ''}

        Devuelve un objeto JSON con esta estructura exacta sin caracteres Markdown:
        {
          "masterImagePrompt": "El prompt de la cuadrícula aquí en INGLÉS (solo si pidieron gráficos, sino vacío)",
          "questions": [
            {
              "id": 1,
              "type": "Opción Múltiple", 
              "statement": "El texto de la pregunta (refiriéndose a la sección de la imagen si es necesario)...",
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
