FROM cypress/included:4.0.2

COPY --chown=1000 ./test /test

WORKDIR /test
RUN yarn install
ENTRYPOINT []
CMD ["cypress", "run"]
