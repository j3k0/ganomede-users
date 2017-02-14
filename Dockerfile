FROM node:6

EXPOSE 8000
MAINTAINER Jean-Christophe Hoelt <hoelt@fovea.cc>

# Create 'app' user
RUN useradd app -d /home/app

# Install NPM packages
COPY package.json /home/app/code/package.json
RUN cd /home/app/code && npm install --production

# Copy app source files
COPY index.js newrelic.js Makefile coffeelint.json .eslintignore .eslintrc /home/app/code/
COPY tests /home/app/code/tests
COPY src /home/app/code/src
RUN chown -R app /home/app

USER app

WORKDIR /home/app/code
CMD node index.js

ENV STORMPATH_API_ID="your_stormpath_id_here"
ENV STORMPATH_API_SECRET="your_stormpath_api_secret_here"
ENV STORMPATH_APP_NAME="Ganomede"
ENV STATSD_HOST=
ENV STATSD_PORT=
ENV STATSD_PREFIX=ganomede.users.
