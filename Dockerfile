FROM python:3.11-slim

WORKDIR /app

# 安装基础系统工具
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl bash procps \
    && rm -rf /var/lib/apt/lists/*

# 安装 Python 依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制代码
COPY . .

RUN chmod +x clash/clash-keeper-loop.sh zashboard/start-gateway.sh

EXPOSE 2053

CMD ["python3", "zashboard/gateway.py"]
