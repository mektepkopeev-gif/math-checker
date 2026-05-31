const express = require('express');
const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

app.post('/api/check', async (req, res) => {
  const { image, studentName, studentClass } = req.body;
  
  console.log('Сурет келді:', image ? image.length : 'жоқ');
  
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer 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'
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${image}`
              }
            },
            {
              type: 'text',
              text: `Сен бастауыш сынып мұғалімінің көмекшісісің. Оқушы: ${studentName || 'Белгісіз'}, Сынып: ${studentClass || ''}.
              
Маңызды ережелер:
1. Нүкте (•) және жұлдызша (*) көбейту белгісі болып саналады — қате емес!
2. Бөлу белгісі (÷) және қос нүкте (:) бөлу белгісі болып саналады — қате емес!
3. Егер жауап математикалық тұрғыдан дұрыс болса is_correct: true қой.
4. Талдауда мыналарды жаз: оқушының күшті жақтары, қандай тақырыпты қайталау керек, мұғалімге нақты кеңес.

Осы қолжазба жұмысын тексер. Тек JSON форматында жауап бер, басқа ешнәрсе жазба:
{"transcription":"оқушы не жазды","tasks":[{"task":"есеп","student_answer":"оқушы жауабы","correct_answer":"дұрыс жауап","is_correct":true,"explanation":"түсіндіру"}],"correct_count":0,"total_count":0,"suggested_grade":5,"analysis":"талдау"}`
            }
          ]
        }]
      })
    });
    
    const data = await response.json();
    console.log('Groq жауабы:', JSON.stringify(data).slice(0, 500));
    
    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }
    
    const text = data.choices[0].message.content;
    const clean = text.replace(/```json|```/g, '').trim();
    res.json(JSON.parse(clean));
  } catch(err) {
    console.log('Қате:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => console.log('Сервер запущен: http://localhost:3000'));