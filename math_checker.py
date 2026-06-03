import re
import json
import datetime
import os
from PIL import Image
import pytesseract

# Tesseract жолын көрсету (Windows үшін)
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

class MathChecker:
    def __init__(self, log_file="check_log.json"):
        self.log_file = log_file
        self.operations = {
            '+': lambda a, b: a + b,
            '-': lambda a, b: a - b,
            '*': lambda a, b: a * b,
            'x': lambda a, b: a * b,
            '/': lambda a, b: a / b if b != 0 else float('inf')
        }
    
    def solve_expression(self, expression):
        expr = expression.strip().replace(' ', '')
        try:
            safe_expr = expr.replace('x', '*')
            if re.match(r'^[\d\+\-\*\/\(\)\.]+$', safe_expr):
                result = eval(safe_expr)
                if isinstance(result, (int, float)):
                    return round(result, 2)
        except:
            pass
        pattern = r'^(-?\d+(?:\.\d+)?)([+\-*x/])(-?\d+(?:\.\d+)?)$'
        match = re.match(pattern, expr)
        if match:
            try:
                num1 = float(match.group(1))
                operator = match.group(2)
                num2 = float(match.group(3))
                if operator in self.operations:
                    result = self.operations[operator](num1, num2)
                    if isinstance(result, float) and result != float('inf'):
                        return round(result, 2)
                    return result
            except:
                return None
        return None
    
    def extract_number(self, text):
        numbers = re.findall(r'-?\d+(?:\.\d+)?', text)
        if not numbers:
            return None
        patterns = [
            r'(?:жауап|Жауап|ответ|Ответ)\s*[:=]\s*(-?\d+(?:\.\d+)?)',
            r'(?:тең|равно|=)\s*(-?\d+(?:\.\d+)?)'
        ]
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                return float(match.group(1))
        return float(numbers[-1])
    
    def analyze_student_solution(self, problem, student_answer, correct_value):
        analysis = {
            'errors': [],
            'suggestions': [],
            'detailed_feedback': ''
        }
        
        if not re.search(r'жауап|Жауап|ответ|Ответ|=|тең', student_answer):
            analysis['errors'].append("❌ Жауап көрсетілмеген / Ответ не указан")
            analysis['suggestions'].append("✓ Жауапты былай жаз: «Жауап: 15»")
        
        numbers = re.findall(r'-?\d+(?:\.\d+)?', student_answer)
        if len(numbers) == 0:
            analysis['errors'].append("❌ Жауапта сан жоқ / В ответе нет числа")
        elif len(numbers) > 1:
            analysis['suggestions'].append("💡 Бірнеше сан бар. Нақты жауапты көрсет / Несколько чисел, укажи точный ответ")
        
        student_number = self.extract_number(student_answer)
        if student_number is not None:
            diff = abs(student_number - correct_value)
            if diff > 0.01:
                analysis['errors'].append(f"❌ Қате есептеу / Ошибка: {student_number} ≠ {correct_value}")
                analysis['suggestions'].append("Қайта есепте / Пересчитай")
        
        if analysis['errors']:
            analysis['detailed_feedback'] = "\n".join(analysis['errors'])
        else:
            analysis['detailed_feedback'] = "✅ Есеп дұрыс шығарылған / Решение верное!"
        
        if analysis['suggestions']:
            analysis['detailed_feedback'] += "\n\n📌 Кеңес / Совет:\n" + "\n".join(analysis['suggestions'])
        
        return analysis
    
    def check_student_solution(self, problem, student_answer):
        result = {
            'problem': problem,
            'student_answer': student_answer,
            'is_correct': False,
            'correct_answer': None,
            'student_number': None,
            'error_message': None,
            'analysis': None,
            'timestamp': datetime.datetime.now().isoformat()
        }
        
        correct_value = self.solve_expression(problem)
        if correct_value is None:
            result['error_message'] = "Өрнек танылмады / Выражение не распознано"
            return result
        
        result['correct_answer'] = correct_value
        
        student_number = self.extract_number(student_answer)
        if student_number is None:
            result['error_message'] = "Жауаптан сан табылмады / В ответе не найдено число"
            return result
        
        result['student_number'] = student_number
        result['is_correct'] = abs(student_number - correct_value) < 0.01
        result['analysis'] = self.analyze_student_solution(problem, student_answer, correct_value)
        
        return result
    
    def save_to_log(self, result):
        try:
            if os.path.exists(self.log_file):
                with open(self.log_file, 'r', encoding='utf-8') as f:
                    logs = json.load(f)
            else:
                logs = []
            logs.append(result)
            with open(self.log_file, 'w', encoding='utf-8') as f:
                json.dump(logs, f, ensure_ascii=False, indent=2)
            print(f"\n💾 Нәтиже сақталды / Результат сохранён: {self.log_file}")
        except Exception as e:
            print(f"\n⚠️ Журналға жазу мүмкін емес / Не удалось сохранить: {e}")
    
    def display_result(self, result):
        print("\n" + "="*60)
        print("НӘТИЖЕ / РЕЗУЛЬТАТ")
        print("="*60)
        
        if result.get('error_message'):
            print(f"\n❌ ҚАТЕ / ОШИБКА: {result['error_message']}")
            return
        
        print(f"\n📝 Тапсырма / Задача: {result['problem']}")
        print(f"📖 Оқушы жауабы / Ответ ученика: {result['student_answer']}")
        print(f"🔢 Сандық жауап / Числовой ответ: {result['student_number']}")
        
        if result['is_correct']:
            print("\n✅ ДҰРЫС / ПРАВИЛЬНО! 🎉")
        else:
            print(f"\n❌ ҚАТЕ / НЕПРАВИЛЬНО")
            print(f"Дұрыс жауап / Правильный ответ: {result['correct_answer']}")
        
        if result.get('analysis'):
            print("\n" + "-"*40)
            print("🔍 ТАЛДАУ / АНАЛИЗ:")
            print("-"*40)
            print(result['analysis']['detailed_feedback'])
        
        print("="*60)


def ocr_from_image(image_path):
    try:
        if not os.path.exists(image_path):
            print(f"❌ Файл табылмады / Файл не найден: {image_path}")
            return None
        
        print("📸 Суреттен мәтінді тану / Распознаём текст с фото...")
        image = Image.open(image_path)
        # Қазақ + ағылшын + орыс тілдерін қолдану
        text = pytesseract.image_to_string(image, lang='kaz+eng+rus')
        
        if text.strip():
            print("✓ Мәтін танылды / Текст распознан")
            return text.strip()
        else:
            print("⚠️ Мәтін танылмады. Сурет сапасын тексер / Текст не распознан")
            return None
    except Exception as e:
        print(f"❌ OCR қатесі / Ошибка OCR: {e}")
        return None


def main():
    print("\n" + "="*60)
    print("МАТЕМАТИКАЛЫҚ ТЕКСЕРУ / ПРОВЕРКА МАТЕМАТИКИ")
    print("="*60)
    print("\nМүмкіндіктер / Возможности:")
    print("• Қарапайым өрнектерді тексеру / Проверка простых выражений (12+7)")
    print("• Фотосуреттен мәтінді тану / OCR с фото")
    print("• Қазақша жауаптарды түсіну / Понимание ответов на казахском")
    print("• Нәтижені журналға сақтау / Сохранение истории")
    
    checker = MathChecker()
    
    while True:
        print("\n" + "-"*40)
        print("\n1️⃣  Қолмен енгізу / Ручной ввод")
        print("2️⃣  Фотосуреттен тану / Распознать с фото")
        print("3️⃣  Журналды көру / Показать историю")
        print("4️⃣  Шығу / Выход")
        
        choice = input("\nТандау / Выбор (1-4): ").strip()
        
        if choice == '4':
            print("\n👋 Сау болыңыз! / До свидания!")
            break
        
        elif choice == '3':
            if os.path.exists(checker.log_file):
                try:
                    with open(checker.log_file, 'r', encoding='utf-8') as f:
                        logs = json.load(f)
                    print("\n" + "="*60)
                    print("📜 ЖУРНАЛ / ИСТОРИЯ")
                    print("="*60)
                    for i, log in enumerate(logs[-10:], 1):
                        print(f"\n{i}. {log['timestamp']}")
                        print(f"   {log['problem']} → {'✅' if log['is_correct'] else '❌'}")
                except:
                    print("\n❌ Журналды оқу мүмкін емес / Не удалось прочитать")
            else:
                print("\n📭 Журнал бос / История пуста")
            continue
        
        elif choice == '2':
            print("\n📸 Фотосуреттің жолын жаз / Введи путь к фото:")
            image_path = input("Мысалы / Пример: C:/photo.jpg: ").strip()
            image_path = image_path.strip('"').strip("'")
            
            student_answer = ocr_from_image(image_path)
            if student_answer is None:
                continue
            
            print("\n📝 Танылған мәтін / Распознанный текст:")
            print("-"*40)
            print(student_answer)
            print("-"*40)
            
            confirm = input("\nОсы мәтінді қолдану керек пе? (иә/я/да/yes): ").strip().lower()
            if confirm not in ['иә', 'я', 'да', 'yes', 'д', 'y']:
                print("Бас тартылды / Отменено")
                continue
            
            problem = input("Математикалық өрнек / Выражение (мысалы 12+7): ").strip()
        
        else:  # choice == '1'
            problem = input("\nМатематикалық өрнек / Выражение (мысалы 12+7): ").strip()
            student_answer = input("Оқушының жауабы / Ответ ученика (мысалы Жауап: 19): ").strip()
        
        print("\n🔄 Тексеру / Проверка...")
        result = checker.check_student_solution(problem, student_answer)
        checker.display_result(result)
        checker.save_to_log(result)
        
        input("\nЖалғастыру үшін Enter басыңыз / Нажмите Enter...")


if __name__ == "__main__":
    main()