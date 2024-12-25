from flask import Flask, render_template, request
import requests
from bs4 import BeautifulSoup
from datetime import datetime
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

@app.after_request
def add_security_headers(response):
    response.headers['Permissions-Policy'] = 'clipboard-write=*'
    return response

def parse_date(date_str):
    try:
        return datetime.strptime(date_str.split(' ')[0], '%m月%d日')
    except ValueError:
        return None


def fetch_holidays(url):
    response = requests.get(url)
    soup = BeautifulSoup(response.text, 'html.parser')

    # 获取网页的标题（从 meta property 中）
    title_tag = soup.find("meta", property="og:title")
    if title_tag:
        page_title = title_tag['content']
    else:
        page_title = "No title found"

    holidays = []
    tables = soup.find_all('table', class_='table')
    for table in tables:
        for row in table.find_all('tr')[1:]:
            cols = row.find_all('td')
            if len(cols) == 4:
                date_str = cols[1].text.strip()
                day = cols[2].text.strip()
                name = cols[3].text.strip()
                date = parse_date(date_str)
                if date:
                    holidays.append((date, date_str, day, name))

    return sorted(holidays, key=lambda x: x[0]), page_title

@app.route('/', methods=['GET', 'POST'])
def index():
    default_url = 'https://www.gov.mo/zh-hant/public-holidays/year-2024/'
    if request.method == 'POST':
        url = request.form.get('url', default_url)
        holidays, page_title = fetch_holidays(url)
        return render_template('holidays.html', holidays=holidays, holiday_count=len(holidays), url=url, page_title=page_title)
    else:
        holidays, page_title = fetch_holidays(default_url)
        return render_template('holidays.html', holidays=holidays, holiday_count=len(holidays), url=default_url, page_title=page_title)

if __name__ == '__main__':
    app.run(debug=True)