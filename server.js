process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const express = require('express');
const { google } = require('googleapis');
const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

const SHEET_ID = '15djenR-ZPKhV1EXLqEYCz2KrRS1IqySEQdhJBvkOHYM';

async function appendToSheet(data) {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: './credentials.json',
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    const sheets = google.sheets({ version: 'v4', auth });
    
    // Бірінші жолға баған атауларын қос
    const check = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Лист1!A1'
    });
    
    if (!check.data.values) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'Лист1!A1',
        valueInputOption: 'RAW',
        resource: {
          values: [['Күні', 'Оқушы аты', 'Сынып', 'Баға', 'Дұрыс/Барлығы', '%', 'Талдау']]
        }
      });
    }
    
    const pct = data.total_count > 0 ? Math.round(data.correct_count / data.total_count * 100) : 0;
    
    // Маңызды: analysis мәтіндік жол (string) болуы керек
    let analysisText = data.analysis || '';
    
    // Егер analysis объект болса, оны мәтінге айналдыр
    if (typeof analysisText === 'object') {
      analysisText = JSON.stringify(analysisText);
    }
    
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'Лист1!A1',
      valueInputOption: 'RAW',
      resource: {
        values: [[
          new Date().toLocaleDateString('kk-KZ'),
          data.studentName || 'Белгісіз',
          data.studentClass || '',
          data.grade || '',
          `${data.correct_count}/${data.total_count}`,
          `${pct}%`,
          analysisText  // Тек мәтіндік жол жіберіледі
        ]]
      }
    });
    console.log('Google Sheets-ке жазылды!');
  } catch(err) {
    console.log('Sheets қатесі:', err.message);
  }
}

// Жауапты тазалау функциясы
function cleanGroqResponse(text) {
  // JSON блогын алып таста
  let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');
  
  // Бүлінген JSON-ды түзету әрекеті
  try {
    // Кейбір кавычка мәселелерін түзету
    cleaned = cleaned.replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":');
    
    // Соңында үтір қалса кетіру
    cleaned = cleaned.replace(/,\s*}/g, '}');
    cleaned = cleaned.replace(/,\s*\]/g, ']');
    
    return cleaned;
  } catch(e) {
    return cleaned;
  }
}

app.post('/api/check', async (req, res) => {
  const { image, studentName, studentClass } = req.body;
  console.log('Сурет келді, ұзындығы:', image ? image.length : 'жоқ');
  
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        max_tokens: 2000,  // Толық жауап алу үшін арттырдым
        temperature: 0.1,  // Тұрақты жауап алу үшін
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${image}` }
            },
            {
              type: 'text',
              text: `Сен бастауыш сынып мұғалімінің көмекшісісің. Оқушы: ${studentName || 'Белгісіз'}, Сынып: ${studentClass || ''}.

Қатаң JSON форматында жауап бер (тек JSON, басқа ештеңе жазба). Мысалы:
{
  "transcription": "оқушы не жазды",
  "tasks": [
    {"task": "2+3", "student_answer": "5", "correct_answer": "5", "is_correct": true, "explanation": "Қосу амалы дұрыс орындалған"}
  ],
  "correct_count": 1,
  "total_count": 1,
  "suggested_grade": 5,
  "analysis": "Оқушы күшті нәтиже көрсетті. Қосу амалын жақсы меңгерген."
}

Ережелер:
- Нүкте (•) және жұлдызша (*) = көбейту
- Бөлу (÷) және қос нүкте (:) = бөлу
- Баға: 100%=5, 75-99%=4, 50-74%=3, <50%=2
- analysis МІНДЕТТІ ТҮРДЕ ТЕК МӘТІН (STRING) БОЛСЫН, объект емес!
- analysis ішінде оқушының күшті жақтары, қайталау керек тақырыптар, мұғалімге кеңес, ынталандыру болсын`
            }
          ]
        }]
      })
    });
    
    const data = await response.json();
    console.log('Groq жауабы келді');
    
    if (data.error) {
      console.error('Groq қатесі:', data.error);
      return res.status(500).json({ error: data.error.message });
    }
    
    let text = data.choices[0].message.content;
    console.log('Raw жауап:', text.slice(0, 500));
    
    // Жауапты тазала
    let cleaned = cleanGroqResponse(text);
    
    // JSON парсинг
    let result;
    try {
      result = JSON.parse(cleaned);
    } catch(e) {
      console.error('JSON парсинг қатесі:', e.message);
      console.error('Тазаланған мәтін:', cleaned);
      
      // Егер парсинг сәтсіз болса, қолмен құрастыру
      result = {
        transcription: "Қате оқылды",
        tasks: [],
        correct_count: 0,
        total_count: 0,
        suggested_grade: 2,
        analysis: "Жүйе техникалық қатеге тап болды. Қайталап көріңіз."
      };
    }
    
    // analysis өрісінің мәтіндік екенін тексер
    if (result.analysis && typeof result.analysis !== 'string') {
      result.analysis = JSON.stringify(result.analysis);
    }
    if (!result.analysis) {
      result.analysis = "Талдау жүргізілмеді.";
    }
    
    // Google Sheets-ке жаз
    const correct = result.correct_count || 0;
    const total = result.total_count || 0;
    const pct = total > 0 ? (correct / total) * 100 : 0;
    const grade = pct === 100 ? 5 : pct >= 75 ? 4 : pct >= 50 ? 3 : 2;
    
    await appendToSheet({
      studentName,
      studentClass,
      grade,
      correct_count: correct,
      total_count: total,
      analysis: result.analysis
    });
    
    res.json(result);
  } catch(err) {
    console.error('Негізгі қате:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => console.log('Сервер запущен: http://localhost:3000'));