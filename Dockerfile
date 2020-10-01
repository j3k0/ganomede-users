# Run
FROM node:12
WORKDIR /home/app/code
MAINTAINER Jean-Christophe Hoelt <hoelt@fovea.cc>
EXPOSE 8000

# Create 'app' user
RUN useradd app -d /home/app

# Install NPM packages
COPY package.json .
COPY package-lock.json .
RUN npm install

ENV NODE_ENV=production
COPY tsconfig.json .
COPY src src
RUN npm run build

# Copy app source files
RUN chown -R app /home/app

USER app
CMD npm start