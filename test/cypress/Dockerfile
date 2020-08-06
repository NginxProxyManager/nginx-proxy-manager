FROM cypress/included:4.12.1

COPY --chown=1000 ./test /test

WORKDIR /test
RUN yarn install
ENTRYPOINT []
CMD ["cypress", "run"]
