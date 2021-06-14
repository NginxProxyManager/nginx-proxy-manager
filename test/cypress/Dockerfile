FROM cypress/included:5.6.0

COPY --chown=1000 ./test /test

WORKDIR /test
RUN yarn install
ENTRYPOINT []
CMD ["cypress", "run"]
