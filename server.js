process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const express = require('express');
const { google } = require('googleapis');
const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

const SHEET_ID = '15djenR-ZPKhV1EXLqEYCz2KrRS1IqySEQdhJBvkOHYM';

function getAnalysisText(analysis) {
  if (!analysis) return '';
  if (typeof analysis === 'string') return analysis;
  if (typeof analysis === 'object') {
    const parts = [];
    if (analysis.strengths) parts.push('Күшті жақтары: ' + analysis.strengths);
    if (analysis.weaknesses) parts.push('Әлсіз жақтары: ' + analysis.weaknesses);
    if (analysis.topics_to_review) parts.push('Қайталау керек: ' + analysis.topics_to_review);
    if (analysis.advice_to_teacher) parts.push('Кеңес: ' + analysis.advice_to_teacher);
    if (analysis.encouragement) parts.push(analysis.encouragement);
    return parts.join(' ');
  }
  return String(analysis);
}

async function appendToSheet(data) {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS || '{}'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    const sheets = google.sheets({ version: 'v4', auth });
    
    let hasHeader = false;
    try {
      const check = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Лист1!A1'
      });
      hasHeader = !!(check.data.values && check.data.values.length);
    } catch(e) {}
    
    if (!hasHeader) {
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
          data.analysis || ''
        ]]
      }
    });
    console.log('Google Sheets-ке жазылды!');
  } catch(err) {
    console.log('Sheets қатесі:', err.message);
  }
}

app.post('/api/check', async (req, res) => {
  const { image, studentName, studentClass } = req.body;
  console.log('Сурет келді:', image ? image.length : 'жоқ');
  
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        max_tokens: 1500,
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

Маңызды ережелер:
1. Нүкте (•) және жұлдызша (*) көбейту белгісі болып саналады — қате емес!
2. Бөлу белгісі (÷) және қос нүкте (:) бөлу белгісі болып саналады — қате емес!
3. Егер жауап математикалық тұрғыдан дұрыс болса is_correct: true қой.
4. Баға қою ережесі (100% = 5, 75-99% = 4, 50-74% = 3, 50%-дан төмен = 2).
5. analysis өрісіне кемінде 5-6 сөйлемнен тұратын толық талдау жаз. Тек қарапайым мәтін, объект емес! Міндетті түрде мыналарды қамти: оқушының күшті жақтарын атап өт; қандай амалдарда қате жібергенін нақты түсіндір; мұғалімге қандай тақырыпты қайталау керектігін айт.

Тек JSON форматында жауап бер, басқа ештеңе жазба:
{"transcription":"оқушы не жазды","tasks":[{"task":"есеп","student_answer":"оқушы жауабы","correct_answer":"дұрыс жауап","is_correct":true,"explanation":"түсіндіру"}],"correct_count":0,"total_count":0,"suggested_grade":5,"analysis":"мұнда кемінде 5-6 сөйлем мәтін жаз"}`
            }
          ]
        }]
      })
    });
    
    const data = await response.json();
    console.log('Groq жауабы:', JSON.stringify(data).slice(0, 200));
    
    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }
    
    const text = data.choices[0].message.content;
    const clean = text.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);
    
    result.analysis = getAnalysisText(result.analysis);
    
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
    console.log('Қате:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => console.log('Сервер запущен: http://localhost:3000'));