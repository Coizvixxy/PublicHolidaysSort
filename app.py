from flask import Flask, render_template, request
import requests
from datetime import datetime
import re

app = Flask(__name__)

@app.route('/', methods=['GET', 'POST'])
def index():
    default_url = 'http://kevinmax.asuscomm.com:1920/'
    url = request.form.get('url', default_url)
    
    try:
        response = requests.get(url)
        # 处理响应...
        holidays = []  # 在这里处理假期数据
        page_title = ''  # 从响应中提取页面标题
        
        return render_template('holidays.html', 
                             holidays=holidays, 
                             holiday_count=len(holidays), 
                             url=url, 
                             page_title=page_title)
    except Exception as e:
        return f"Error: {str(e)}", 500

if __name__ == '__main__':
    app.run(debug=True)