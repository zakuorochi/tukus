
import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
    // 1. Configuración de cabeceras CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method Not Allowed' });
    }

    try {
        const { images, grade, questionTypes } = req.body;

        if (!images || !images.length || !grade || !questionTypes || !questionTypes.length) {
            return res.status(400).json({ success: false, message: 'Faltan parámetros (imágenes, grado o tipos de pregunta)' });
        }

        // 2. Inicializar la API de Gemini
        // Asegúrate de tener tu API KEY en un archivo .env local como: GEMINI_API_KEY=tu_clave
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        // gemini-1.5-flash es excelente y muy rápido para leer múltiples imágenes
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        // 3. Preparar las imágenes para la API de Gemini
        // Gemini espera un formato específico (inlineData)
        const imageParts = images.map(imgBase64 => {
            // Quitamos el prefijo si existe
            const base64Data = imgBase64.replace(/^data:image\/\w+;base64,/, '');
            return {
                inlineData: {
                    data: base64Data,
                    mimeType: "image/jpeg" // Asumimos JPEG por el procesamiento anterior
                }
            };
        });

        // 4. El "Prompt" (Instrucciones precisas al motor IA)
        const promptText = `
        Eres un experto pedagogo, paleógrafo y creador de material educativo para niños.
        Tu tarea es analizar las imágenes adjuntas, que son fotos de cuadernos escolares escritos a mano.
        Debes leer la información (incluso si la caligrafía infantil es difícil) y generar exactamente 20 preguntas evaluativas basadas EXCLUSIVAMENTE en el contenido de esos apuntes.

        Criterios de adaptación:
        - El estudiante cursa el ${grade}° grado de primaria. Ajusta el vocabulario, la dificultad y el tono de las respuestas a ese nivel cognitivo.
        - Los tipos de pregunta que debes generar son estrictamente de estas categorías: ${questionTypes.join(', ')}.

        Estructura de la salida:
        Debes devolver ÚNICAMENTE un objeto JSON válido (sin formato Markdown, sin texto adicional), con la siguiente estructura exacta:
        {
          "questions": [
            {
              "id": 1,
              "type": "Opción Múltiple", 
              "statement": "Pregunta formulada",
              "options": ["Opción 1", "Opción 2", "Opción 3", "Opción 4"], // Solo para Opción Múltiple, si no, déjalo vacío []
              "answer": "Respuesta correcta o sugerida"
            }
          ]
        }
        `;

        // 5. Llamada multimodal a Gemini (Texto + Imágenes)
        const requestContent = [promptText, ...imageParts];
        
        console.log("Enviando petición a Gemini...");
        const result = await model.generateContent(requestContent);
        const responseText = result.response.text();

        // 6. Limpieza y parseo del resultado JSON
        // A veces Gemini envuelve el JSON en bloques de código markdown (```json ... ```)
        let cleanedJson = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
        
        const parsedData = JSON.parse(cleanedJson);

        // 7. Retornar al frontend
        return res.status(200).json({
            success: true,
            questions: parsedData.questions
        });

    } catch (error) {
        console.error('Error generando preguntas con Gemini:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Error en el motor de IA al generar el cuestionario.',
            error: error.message 
        });
    }
}
