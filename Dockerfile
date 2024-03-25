# Dockerfile for running local.storage service.
# CircleCI just gives us a nice Node image; this isn't for CI.
FROM cimg/node:20.11.1
USER circleci
RUN mkdir -p /home/circleci/app
WORKDIR /home/circleci/app
COPY --chown=circleci:circleci package*.json ./
COPY --chown=circleci:circleci src ./src
EXPOSE 3000
RUN npm install
CMD [ "npm", "start" ]
