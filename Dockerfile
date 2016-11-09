FROM node:0.10.48-slim
EXPOSE 8000
MAINTAINER Jean-Christophe Hoelt <hoelt@fovea.cc>
RUN useradd app -d /home/app
WORKDIR /home/app/code
COPY package.json /home/app/code/package.json
RUN chown -R app /home/app

USER app
RUN npm install

COPY index.js newrelic.js Makefile coffeelint.json .eslintignore .eslintrc /home/app/code/
COPY tests /home/app/code/tests
COPY src /home/app/code/src

USER root
RUN chown -R app /home/app

WORKDIR /home/app/code
USER app
# RUN make check

ENV STORMPATH_API_ID="your_stormpath_id_here"
ENV STORMPATH_API_SECRET="your_stormpath_api_secret_here"
ENV STORMPATH_APP_NAME="Ganomede"
ENV STATSD_HOST=
ENV STATSD_PORT=
ENV STATSD_PREFIX=ganomede.users.

CMD node index.js
