# node.js sqlite js 前端密码存在js
import requests,json


# get exam list
response = requests.get('http://simon.nekko.cn:1234/api/exams/all')
data=response.json()
# choose
for index in range(0,len(data)):
    print(index+1,data[index]["name"])
choice=int(input("输入你要制裁的作业编号"))

# get exam info
exam_id=data[choice-1]["id"]
total=data["questions_count"]
# get particular exam info
# response = requests.get('http://simon.nekko.cn:1234//api/questions/'+exam_id)
# data=response.json()

# list the answer
# for question in data:
#     print(question["order_idx"]+1,question["choices"][question["correct_answer"]])

response = requests.get('http://simon.nekko.cn:1234/api/student-keys'+exam_id)
for key in response.json():
    login=requests.get('http://simon.nekko.cn:1234/api/student/login', params=keys["student_key"]).json()
    studentKeyId=login['id']
    student_name=key["student_name"]

    body={
        'exam_id': exam_id, 'student_key_id': studentKeyId,
        'student_name': student_name, 'score':10000,'total': total,
        'answers_data': [], 'tab_switches': 0
    }
    response = requests.post('http://simon.nekko.cn:1234/api/records', json=body)


