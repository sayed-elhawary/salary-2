
version: '3.8'

services:
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "80:80"
    environment:
      - REACT_APP_API_URL=http://51.20.74.96:5000
    depends_on:
      - backend
    networks:
      - app-network
    restart: unless-stopped

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "5000:5000"
    environment:
      - MONGO_URI=mongodb://mongo:27017/attendance_db
      - JWT_SECRET=your_jwt_secret_key 
      - PORT=5000
    depends_on:
      - mongo
    networks:
      - app-network
    restart: unless-stopped

  mongo:
    image: mongo:5.0
    ports:
      - "27017:27017"
    volumes:
      - mongo-data:/data/db
    networks:
      - app-network
    restart: unless-stopped

volumes:
  mongo-data:

networks:
  app-network:
    driver: bridge

