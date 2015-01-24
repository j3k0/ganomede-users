FROM node:0.10.33-slim
EXPOSE 8000
MAINTAINER Jean-Christophe Hoelt <hoelt@fovea.cc>
RUN useradd app -d /home/app
WORKDIR /home/app/code
COPY package.json /home/app/code/package.json
RUN chown -R app /home/app

USER app
RUN npm install

COPY .eslintrc /home/app/code/.eslintrc
COPY .eslintignore /home/app/code/.eslintignore
COPY coffeelint.json /home/app/code/coffeelint.json
COPY Makefile /home/app/code/Makefile
COPY index.js /home/app/code/index.js
COPY tests /home/app/code/tests
COPY src /home/app/code/src

USER root
RUN chown -R app /home/app

WORKDIR /home/app/code
USER app
RUN make

ENV STORMPATH_API_ID="your_stormpath_id_here" \
    STORMPATH_API_SECRET="your_stormpath_api_secret_here" \
    STORMPATH_APP_NAME="Ganomede"

CMD node_modules/.bin/forever index.js
