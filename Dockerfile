FROM node:12
WORKDIR /home/app/code
MAINTAINER Jean-Christophe Hoelt <hoelt@fovea.cc>
EXPOSE 8000

# Install "jq", used to run tests
RUN apt-get update && apt-get install -y \
    jq \
 && rm -rf /var/lib/apt/lists/*

# Create 'app' user
RUN useradd app -d /home/app

# Install NPM packages
COPY package.json .
COPY package-lock.json .
RUN npm install

ENV NODE_ENV=production
COPY tsconfig.json .
COPY tests tests
COPY src src
RUN npm run build

# Copy app source files
RUN chown -R app /home/app

USER app
CMD npm start