import requests

name=input("输入你的名字")
# get exam list
data=requests.get("http://simon.nekko.cn:1234/api/student/exams", params={'student_name':name}).json()
# choose
for index in range(0,len(data)):
    print(index+1,data[index]["exam"]["name"])
choice=int(input("输入你要查询答案的作业编号"))

login=requests.get('http://simon.nekko.cn:1234/api/student/login', params={"key":"D892SUC7"}).json()

answer=requests.get("http://simon.nekko.cn:1234/api/records", params={"exam_id":data[choice-1]["exam"]["id"],"student_key_id":login["id"]}).json()

print(answer)
"""student_key_id":login["id"]"""
