pipeline {
  options {
    buildDiscarder(logRotator(numToKeepStr: '10'))
    disableConcurrentBuilds()
  }
  agent any
  environment {
    IMAGE            = "nginx-proxy-manager"
    BASE_IMAGE       = "jc21/nginx-proxy-manager-base"
    TEMP_IMAGE       = "nginx-proxy-manager-build_${BUILD_NUMBER}"
    TAG_VERSION      = getPackageVersion()
    MAJOR_VERSION    = "2"
    BRANCH_LOWER     = "${BRANCH_NAME.toLowerCase()}"
    // Architectures:
    AMD64_TAG        = "amd64"
    ARMV6_TAG        = "armv6l"
    ARMV7_TAG        = "armv7l"
    ARM64_TAG        = "aarch64"
  }
  stages {
    stage('Build PR') {
      when {
        changeRequest()
      }
      steps {
        ansiColor('xterm') {
          // Codebase
          sh 'docker run --rm -v $(pwd):/app -w /app ${BASE_IMAGE} yarn install'
          sh 'docker run --rm -v $(pwd):/app -w /app ${BASE_IMAGE} npm run-script build'
          sh 'rm -rf node_modules'
          sh 'docker run --rm -v $(pwd):/app -w /app ${BASE_IMAGE} yarn install --prod'
          sh 'docker run --rm -v $(pwd):/data ${DOCKER_CI_TOOLS} node-prune'

          // Docker Build
          sh 'docker build --pull --no-cache --squash --compress -t ${TEMP_IMAGE}-${AMD64_TAG} .'

          // Dockerhub
          sh 'docker tag ${TEMP_IMAGE}-${AMD64_TAG} docker.io/jc21/${IMAGE}:github-${BRANCH_LOWER}-${AMD64_TAG}'
          withCredentials([usernamePassword(credentialsId: 'jc21-dockerhub', passwordVariable: 'dpass', usernameVariable: 'duser')]) {
            sh "docker login -u '${duser}' -p '${dpass}'"
            sh 'docker push docker.io/jc21/${IMAGE}:github-${BRANCH_LOWER}-${AMD64_TAG}'
          }

          sh 'docker rmi ${TEMP_IMAGE}-${AMD64_TAG}'

          script {
            def comment = pullRequest.comment("Docker Image for build ${BUILD_NUMBER} is available on [DockerHub](https://cloud.docker.com/repository/docker/jc21/${IMAGE}) as `jc21/${IMAGE}:github-${BRANCH_LOWER}-${AMD64_TAG}`")
          }
        }
      }
    }
    stage('Build Develop') {
      when {
        branch 'develop'
      }
      steps {
        ansiColor('xterm') {
          // Codebase
          sh 'docker run --rm -v $(pwd):/app -w /app ${BASE_IMAGE} yarn install'
          sh 'docker run --rm -v $(pwd):/app -w /app ${BASE_IMAGE} npm run-script build'
          sh 'rm -rf node_modules'
          sh 'docker run --rm -v $(pwd):/app -w /app ${BASE_IMAGE} yarn install --prod'
          sh 'docker run --rm -v $(pwd):/data ${DOCKER_CI_TOOLS} node-prune'

          // Docker Build
          sh 'docker build --pull --no-cache --squash --compress -t ${TEMP_IMAGE}-${AMD64_TAG} .'

          // Dockerhub
          sh 'docker tag ${TEMP_IMAGE}-${AMD64_TAG} docker.io/jc21/${IMAGE}:develop-${AMD64_TAG}'
          withCredentials([usernamePassword(credentialsId: 'jc21-dockerhub', passwordVariable: 'dpass', usernameVariable: 'duser')]) {
            sh "docker login -u '${duser}' -p '${dpass}'"
            sh 'docker push docker.io/jc21/${IMAGE}:develop-${AMD64_TAG}'
          }

          sh 'docker rmi ${TEMP_IMAGE}-${AMD64_TAG}'
        }
      }
    }
    stage('Build Master') {
      when {
        branch 'master'
      }
      parallel {
        // ========================
        // amd64
        // ========================
        stage('amd64') {
          agent {
            label 'amd64'
          }
          steps {
            ansiColor('xterm') {
              // Codebase
              sh 'docker run --rm -v $(pwd):/app -w /app ${BASE_IMAGE} yarn install'
              sh 'docker run --rm -v $(pwd):/app -w /app ${BASE_IMAGE} npm run-script build'
              sh 'rm -rf node_modules'
              sh 'docker run --rm -v $(pwd):/app -w /app ${BASE_IMAGE} yarn install --prod'
              sh 'docker run --rm -v $(pwd):/data ${DOCKER_CI_TOOLS} node-prune'

              // Docker Build
              sh 'docker build --pull --no-cache --squash --compress -t ${TEMP_IMAGE}-${AMD64_TAG} .'

              // Dockerhub
              sh 'docker tag ${TEMP_IMAGE}-${AMD64_TAG} docker.io/jc21/${IMAGE}:${TAG_VERSION}-${AMD64_TAG}'
              sh 'docker tag ${TEMP_IMAGE}-${AMD64_TAG} docker.io/jc21/${IMAGE}:${MAJOR_VERSION}-${AMD64_TAG}'
              sh 'docker tag ${TEMP_IMAGE}-${AMD64_TAG} docker.io/jc21/${IMAGE}:latest-${AMD64_TAG}'

              withCredentials([usernamePassword(credentialsId: 'jc21-dockerhub', passwordVariable: 'dpass', usernameVariable: 'duser')]) {
                sh "docker login -u '${duser}' -p '${dpass}'"
                sh 'docker push docker.io/jc21/${IMAGE}:${TAG_VERSION}-${AMD64_TAG}'
                sh 'docker push docker.io/jc21/${IMAGE}:${MAJOR_VERSION}-${AMD64_TAG}'
                sh 'docker push docker.io/jc21/${IMAGE}:latest-${AMD64_TAG}'
              }

              sh 'docker rmi ${TEMP_IMAGE}-${AMD64_TAG}'
            }
          }
        }
        // ========================
        // aarch64
        // ========================
        stage('aarch64') {
          agent {
            label 'aarch64'
          }
          steps {
            ansiColor('xterm') {
              // Codebase
              sh 'docker run --rm -v $(pwd):/app -w /app ${BASE_IMAGE} yarn install'
              sh 'docker run --rm -v $(pwd):/app -w /app ${BASE_IMAGE} npm run-script build'
              sh 'sudo rm -rf node_modules'
              sh 'docker run --rm -v $(pwd):/app -w /app ${BASE_IMAGE} yarn install --prod'

              // Docker Build
              sh 'docker build --pull --no-cache --squash --compress -t ${TEMP_IMAGE}-${ARM64_TAG} -f Dockerfile.${ARM64_TAG} .'

              // Dockerhub
              sh 'docker tag ${TEMP_IMAGE}-${ARM64_TAG} docker.io/jc21/${IMAGE}:${TAG_VERSION}-${ARM64_TAG}'
              sh 'docker tag ${TEMP_IMAGE}-${ARM64_TAG} docker.io/jc21/${IMAGE}:${MAJOR_VERSION}-${ARM64_TAG}'
              sh 'docker tag ${TEMP_IMAGE}-${ARM64_TAG} docker.io/jc21/${IMAGE}:latest-${ARM64_TAG}'

              withCredentials([usernamePassword(credentialsId: 'jc21-dockerhub', passwordVariable: 'dpass', usernameVariable: 'duser')]) {
                sh "docker login -u '${duser}' -p '${dpass}'"
                sh 'docker push docker.io/jc21/${IMAGE}:${TAG_VERSION}-${ARM64_TAG}'
                sh 'docker push docker.io/jc21/${IMAGE}:${MAJOR_VERSION}-${ARM64_TAG}'
                sh 'docker push docker.io/jc21/${IMAGE}:latest-${ARM64_TAG}'
              }

              sh 'docker rmi ${TEMP_IMAGE}-${ARM64_TAG}'

              // Hack to clean up ec2 instance for next build
              sh 'sudo chown -R ec2-user:ec2-user * || echo "Skipping ec2 ownership"'
            }
          }
        }
        // ========================
        // armv7l
        // ========================
        stage('armv7l') {
          agent {
            label 'armv7l'
          }
          steps {
            ansiColor('xterm') {
              // Codebase
              sh 'docker run --rm -v $(pwd):/app -w /app ${BASE_IMAGE} yarn install'
              sh 'docker run --rm -v $(pwd):/app -w /app ${BASE_IMAGE} npm run-script build'
              sh 'rm -rf node_modules'
              sh 'docker run --rm -v $(pwd):/app -w /app ${BASE_IMAGE} yarn install --prod'

              // Docker Build
              sh 'docker build --pull --no-cache --squash --compress -t ${TEMP_IMAGE}-${ARMV7_TAG} -f Dockerfile.${ARMV7_TAG} .'

              // Dockerhub
              sh 'docker tag ${TEMP_IMAGE}-${ARMV7_TAG} docker.io/jc21/${IMAGE}:${TAG_VERSION}-${ARMV7_TAG}'
              sh 'docker tag ${TEMP_IMAGE}-${ARMV7_TAG} docker.io/jc21/${IMAGE}:${MAJOR_VERSION}-${ARMV7_TAG}'
              sh 'docker tag ${TEMP_IMAGE}-${ARMV7_TAG} docker.io/jc21/${IMAGE}:latest-${ARMV7_TAG}'

              withCredentials([usernamePassword(credentialsId: 'jc21-dockerhub', passwordVariable: 'dpass', usernameVariable: 'duser')]) {
                sh "docker login -u '${duser}' -p '${dpass}'"
                sh 'docker push docker.io/jc21/${IMAGE}:${TAG_VERSION}-${ARMV7_TAG}'
                sh 'docker push docker.io/jc21/${IMAGE}:${MAJOR_VERSION}-${ARMV7_TAG}'
                sh 'docker push docker.io/jc21/${IMAGE}:latest-${ARMV7_TAG}'
              }

              sh 'docker rmi ${TEMP_IMAGE}-${ARMV7_TAG}'
            }
          }
        }
        // ========================
        // armv6l - Disabled for the time being
        // ========================
        /*
        stage('armv6l') {
          agent {
            label 'armv6l'
          }
          steps {
            ansiColor('xterm') {
              // Codebase
              sh 'docker run --rm -v $(pwd):/app -w /app ${BASE_IMAGE} yarn install'
              sh 'docker run --rm -v $(pwd):/app -w /app ${BASE_IMAGE} npm run-script build'
              sh 'rm -rf node_modules'
              sh 'docker run --rm -v $(pwd):/app -w /app ${BASE_IMAGE} yarn install --prod'

              // Docker Build
              sh 'docker build --pull --no-cache --squash --compress -t ${TEMP_IMAGE}-${ARMV6_TAG} -f Dockerfile.${ARMV6_TAG} .'

              // Dockerhub
              sh 'docker tag ${TEMP_IMAGE}-${ARMV6_TAG} docker.io/jc21/${IMAGE}:${TAG_VERSION}-${ARMV6_TAG}'
              sh 'docker tag ${TEMP_IMAGE}-${ARMV6_TAG} docker.io/jc21/${IMAGE}:${MAJOR_VERSION}-${ARMV6_TAG}'
              sh 'docker tag ${TEMP_IMAGE}-${ARMV6_TAG} docker.io/jc21/${IMAGE}:latest-${ARMV6_TAG}'

              withCredentials([usernamePassword(credentialsId: 'jc21-dockerhub', passwordVariable: 'dpass', usernameVariable: 'duser')]) {
                sh "docker login -u '${duser}' -p '${dpass}'"
                sh 'docker push docker.io/jc21/${IMAGE}:${TAG_VERSION}-${ARMV6_TAG}'
                sh 'docker push docker.io/jc21/${IMAGE}:${MAJOR_VERSION}-${ARMV6_TAG}'
                sh 'docker push docker.io/jc21/${IMAGE}:latest-${ARMV6_TAG}'
              }

              sh 'docker rmi ${TEMP_IMAGE}-${ARMV6_TAG}'
            }
          }
        }
        */
      }
    }
    // ========================
    // latest manifest
    // ========================
    stage('Latest Manifest') {
      when {
        branch 'master'
      }
      steps {
        ansiColor('xterm') {
          // =======================
          // latest
          // =======================
          sh 'docker pull jc21/${IMAGE}:latest-${AMD64_TAG}'
          sh 'docker pull jc21/${IMAGE}:latest-${ARM64_TAG}'
          sh 'docker pull jc21/${IMAGE}:latest-${ARMV7_TAG}'
          //sh 'docker pull jc21/${IMAGE}:latest-${ARMV6_TAG}'

          sh 'docker manifest push --purge jc21/${IMAGE}:latest || :'
          sh 'docker manifest create jc21/${IMAGE}:latest jc21/${IMAGE}:latest-${AMD64_TAG} jc21/${IMAGE}:latest-${ARM64_TAG} jc21/${IMAGE}:latest-${ARMV7_TAG}'

          sh 'docker manifest annotate jc21/${IMAGE}:latest jc21/${IMAGE}:latest-${AMD64_TAG} --arch ${AMD64_TAG}'
          sh 'docker manifest annotate jc21/${IMAGE}:latest jc21/${IMAGE}:latest-${ARM64_TAG} --arch ${ARM64_TAG}'
          sh 'docker manifest annotate jc21/${IMAGE}:latest jc21/${IMAGE}:latest-${ARMV7_TAG} --arch arm --variant ${ARMV7_TAG}'
          //sh 'docker manifest annotate jc21/${IMAGE}:latest jc21/${IMAGE}:latest-${ARMV6_TAG} --arch arm --variant ${ARMV6_TAG}'
          sh 'docker manifest push --purge jc21/${IMAGE}:latest'

          // =======================
          // major version
          // =======================
          sh 'docker pull jc21/${IMAGE}:${MAJOR_VERSION}-${AMD64_TAG}'
          sh 'docker pull jc21/${IMAGE}:${MAJOR_VERSION}-${ARM64_TAG}'
          sh 'docker pull jc21/${IMAGE}:${MAJOR_VERSION}-${ARMV7_TAG}'
          //sh 'docker pull jc21/${IMAGE}:${MAJOR_VERSION}-${ARMV6_TAG}'

          sh 'docker manifest push --purge jc21/${IMAGE}:${MAJOR_VERSION} || :'
          sh 'docker manifest create jc21/${IMAGE}:${MAJOR_VERSION} jc21/${IMAGE}:${MAJOR_VERSION}-${AMD64_TAG} jc21/${IMAGE}:${MAJOR_VERSION}-${ARM64_TAG} jc21/${IMAGE}:${MAJOR_VERSION}-${ARMV7_TAG}'

          sh 'docker manifest annotate jc21/${IMAGE}:${MAJOR_VERSION} jc21/${IMAGE}:${MAJOR_VERSION}-${AMD64_TAG} --arch ${AMD64_TAG}'
          sh 'docker manifest annotate jc21/${IMAGE}:${MAJOR_VERSION} jc21/${IMAGE}:${MAJOR_VERSION}-${ARM64_TAG} --arch ${ARM64_TAG}'
          sh 'docker manifest annotate jc21/${IMAGE}:${MAJOR_VERSION} jc21/${IMAGE}:${MAJOR_VERSION}-${ARMV7_TAG} --arch arm --variant ${ARMV7_TAG}'
          //sh 'docker manifest annotate jc21/${IMAGE}:${MAJOR_VERSION} jc21/${IMAGE}:${MAJOR_VERSION}-${ARMV6_TAG} --arch arm --variant ${ARMV6_TAG}'

          // =======================
          // version
          // =======================
          sh 'docker pull jc21/${IMAGE}:${TAG_VERSION}-${AMD64_TAG}'
          sh 'docker pull jc21/${IMAGE}:${TAG_VERSION}-${ARM64_TAG}'
          sh 'docker pull jc21/${IMAGE}:${TAG_VERSION}-${ARMV7_TAG}'
          //sh 'docker pull jc21/${IMAGE}:${TAG_VERSION}-${ARMV6_TAG}'

          sh 'docker manifest push --purge jc21/${IMAGE}:${TAG_VERSION} || :'
          sh 'docker manifest create jc21/${IMAGE}:${TAG_VERSION} jc21/${IMAGE}:${TAG_VERSION}-${AMD64_TAG} jc21/${IMAGE}:${TAG_VERSION}-${ARM64_TAG} jc21/${IMAGE}:${TAG_VERSION}-${ARMV7_TAG}'

          sh 'docker manifest annotate jc21/${IMAGE}:${TAG_VERSION} jc21/${IMAGE}:${TAG_VERSION}-${AMD64_TAG} --arch ${AMD64_TAG}'
          sh 'docker manifest annotate jc21/${IMAGE}:${TAG_VERSION} jc21/${IMAGE}:${TAG_VERSION}-${ARM64_TAG} --arch ${ARM64_TAG}'
          sh 'docker manifest annotate jc21/${IMAGE}:${TAG_VERSION} jc21/${IMAGE}:${TAG_VERSION}-${ARMV7_TAG} --arch arm --variant ${ARMV7_TAG}'
          //sh 'docker manifest annotate jc21/${IMAGE}:${TAG_VERSION} jc21/${IMAGE}:${TAG_VERSION}-${ARMV6_TAG} --arch arm --variant ${ARMV6_TAG}'
        }
      }
    }
    // ========================
    // develop
    // ========================
    stage('Develop Manifest') {
      when {
        branch 'develop'
      }
      steps {
        ansiColor('xterm') {
          sh 'docker pull jc21/${IMAGE}:develop-${AMD64_TAG}'
          //sh 'docker pull jc21/${IMAGE}:develop-${ARM64_TAG}'
          //sh 'docker pull jc21/${IMAGE}:develop-${ARMV7_TAG}'
          //sh 'docker pull jc21/${IMAGE}:${TAG_VERSION}-${ARMV6_TAG}'

          sh 'docker manifest push --purge jc21/${IMAGE}:develop || :'
          sh 'docker manifest create jc21/${IMAGE}:develop jc21/${IMAGE}:develop-${AMD64_TAG}'

          sh 'docker manifest annotate jc21/${IMAGE}:develop jc21/${IMAGE}:develop-${AMD64_TAG} --arch ${AMD64_TAG}'
          //sh 'docker manifest annotate jc21/${IMAGE}:develop jc21/${IMAGE}:develop-${ARM64_TAG} --arch ${ARM64_TAG}'
          //sh 'docker manifest annotate jc21/${IMAGE}:develop jc21/${IMAGE}:develop-${ARMV7_TAG} --arch arm --variant ${ARMV7_TAG}'
          //sh 'docker manifest annotate jc21/${IMAGE}:develop jc21/${IMAGE}:develop-${ARMV6_TAG} --arch arm --variant ${ARMV6_TAG}'
        }
      }
    }
    // ========================
    // cleanup
    // ========================
    stage('Latest Cleanup') {
      when {
        branch 'master'
      }
      steps {
        ansiColor('xterm') {
          sh 'docker rmi jc21/${IMAGE}:latest jc21/${IMAGE}:latest-${AMD64_TAG} jc21/${IMAGE}:latest-${ARM64_TAG} jc21/${IMAGE}:latest-${ARMV7_TAG}'
          sh 'docker rmi jc21/${IMAGE}:${MAJOR_VERSION}-${AMD64_TAG} jc21/${IMAGE}:${MAJOR_VERSION}-${ARM64_TAG} jc21/${IMAGE}:${MAJOR_VERSION}-${ARMV7_TAG}'
          sh 'docker rmi jc21/${IMAGE}:${TAG_VERSION}-${AMD64_TAG} jc21/${IMAGE}:${TAG_VERSION}-${ARM64_TAG} jc21/${IMAGE}:${TAG_VERSION}-${ARMV7_TAG}'
        }
      }
    }
    stage('Develop Cleanup') {
      when {
        branch 'develop'
      }
      steps {
        ansiColor('xterm') {
          sh 'docker rmi jc21/${IMAGE}:develop jc21/${IMAGE}:develop-${AMD64_TAG}'
        }
      }
    }
    stage('PR Cleanup') {
      when {
        changeRequest()
      }
      steps {
        ansiColor('xterm') {
          sh 'docker rmi jc21/${IMAGE}:github-${BRANCH_LOWER}-${AMD64_TAG}'
        }
      }
    }
  }
  post {
    success {
      juxtapose event: 'success'
      sh 'figlet "SUCCESS"'
    }
    failure {
      juxtapose event: 'failure'
      sh 'figlet "FAILURE"'
    }
  }
}

def getPackageVersion() {
  ver = sh(script: 'docker run --rm -v $(pwd):/data ${DOCKER_CI_TOOLS} bash -c "cat /data/package.json|jq -r \'.version\'"', returnStdout: true)
  return ver.trim()
}
