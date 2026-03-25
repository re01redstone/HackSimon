import requests

# use student
data=requests.get("http://simon.nekko.cn:1234/api/student/exams", params={'student_name':'郭宇轩'}).json()
print(data)

# use teacher
# data=requests.get("http://simon.nekko.cn:1234/api/exams", params={'teacher_id':'teacher-7'})
# print(data)
