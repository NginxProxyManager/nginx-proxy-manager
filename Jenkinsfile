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
    TEMP_IMAGE_ARM   = "nginx-proxy-manager-arm-build_${BUILD_NUMBER}"
    TEMP_IMAGE_ARM64 = "nginx-proxy-manager-arm64-build_${BUILD_NUMBER}"
    TAG_VERSION      = getPackageVersion()
    MAJOR_VERSION    = "2"
    BRANCH_LOWER     = "${BRANCH_NAME.toLowerCase()}"
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
          sh 'docker build --pull --no-cache --squash --compress -t ${TEMP_IMAGE} .'

          // Dockerhub
          sh 'docker tag ${TEMP_IMAGE} docker.io/jc21/${IMAGE}:github-${BRANCH_LOWER}'
          withCredentials([usernamePassword(credentialsId: 'jc21-dockerhub', passwordVariable: 'dpass', usernameVariable: 'duser')]) {
            sh "docker login -u '${duser}' -p '${dpass}'"
            sh 'docker push docker.io/jc21/${IMAGE}:github-${BRANCH_LOWER}'
          }

          sh 'docker rmi ${TEMP_IMAGE}'

          script {
            def comment = pullRequest.comment("Docker Image for build ${BUILD_NUMBER} is available on [DockerHub](https://cloud.docker.com/repository/docker/jc21/${IMAGE}) as `jc21/${IMAGE}:github-${BRANCH_LOWER}`")
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
          sh 'docker build --pull --no-cache --squash --compress -t ${TEMP_IMAGE} .'

          // Dockerhub
          sh 'docker tag ${TEMP_IMAGE} docker.io/jc21/${IMAGE}:develop'
          withCredentials([usernamePassword(credentialsId: 'jc21-dockerhub', passwordVariable: 'dpass', usernameVariable: 'duser')]) {
            sh "docker login -u '${duser}' -p '${dpass}'"
            sh 'docker push docker.io/jc21/${IMAGE}:develop'
          }

          // Private Registry
          sh 'docker tag ${TEMP_IMAGE} ${DOCKER_PRIVATE_REGISTRY}/${IMAGE}:develop'
          withCredentials([usernamePassword(credentialsId: 'jc21-private-registry', passwordVariable: 'dpass', usernameVariable: 'duser')]) {
            sh "docker login -u '${duser}' -p '${dpass}' ${DOCKER_PRIVATE_REGISTRY}"
            sh 'docker push ${DOCKER_PRIVATE_REGISTRY}/${IMAGE}:develop'
          }

          sh 'docker rmi ${TEMP_IMAGE}'
        }
      }
    }
    stage('Build Master') {
      when {
        branch: 'master'
      }
      parallel {
        stage('x86_64') {
          steps {
            ansiColor('xterm') {
              // Codebase
              sh 'docker run --rm -v $(pwd):/app -w /app ${BASE_IMAGE} yarn install'
              sh 'docker run --rm -v $(pwd):/app -w /app ${BASE_IMAGE} npm run-script build'
              sh 'rm -rf node_modules'
              sh 'docker run --rm -v $(pwd):/app -w /app ${BASE_IMAGE} yarn install --prod'
              sh 'docker run --rm -v $(pwd):/data ${DOCKER_CI_TOOLS} node-prune'

              // Docker Build
              sh 'docker build --pull --no-cache --squash --compress -t ${TEMP_IMAGE} .'

              // Dockerhub
              sh 'docker tag ${TEMP_IMAGE} docker.io/jc21/${IMAGE}:${TAG_VERSION}'
              sh 'docker tag ${TEMP_IMAGE} docker.io/jc21/${IMAGE}:${MAJOR_VERSION}'
              sh 'docker tag ${TEMP_IMAGE} docker.io/jc21/${IMAGE}:latest'

              withCredentials([usernamePassword(credentialsId: 'jc21-dockerhub', passwordVariable: 'dpass', usernameVariable: 'duser')]) {
                sh "docker login -u '${duser}' -p '${dpass}'"
                sh 'docker push docker.io/jc21/${IMAGE}:${TAG_VERSION}'
                sh 'docker push docker.io/jc21/${IMAGE}:${MAJOR_VERSION}'
                sh 'docker push docker.io/jc21/${IMAGE}:latest'
              }

              // Private Registry
              sh 'docker tag ${TEMP_IMAGE} ${DOCKER_PRIVATE_REGISTRY}/${IMAGE}:${TAG_VERSION}'
              sh 'docker tag ${TEMP_IMAGE} ${DOCKER_PRIVATE_REGISTRY}/${IMAGE}:${MAJOR_VERSION}'
              sh 'docker tag ${TEMP_IMAGE} ${DOCKER_PRIVATE_REGISTRY}/${IMAGE}:latest'

              withCredentials([usernamePassword(credentialsId: 'jc21-private-registry', passwordVariable: 'dpass', usernameVariable: 'duser')]) {
                sh "docker login -u '${duser}' -p '${dpass}' ${DOCKER_PRIVATE_REGISTRY}"
                sh 'docker push ${DOCKER_PRIVATE_REGISTRY}/${IMAGE}:${TAG_VERSION}'
                sh 'docker push ${DOCKER_PRIVATE_REGISTRY}/${IMAGE}:${MAJOR_VERSION}'
                sh 'docker push ${DOCKER_PRIVATE_REGISTRY}/${IMAGE}:latest'
              }

              sh 'docker rmi ${TEMP_IMAGE}'
            }
          }
        }
        stage('armhf') {
          agent {
            label 'armhf'
          }
          steps {
            ansiColor('xterm') {
              // Codebase
              sh 'docker run --rm -v $(pwd):/app -w /app ${BASE_IMAGE}:armhf yarn install'
              sh 'docker run --rm -v $(pwd):/app -w /app ${BASE_IMAGE}:armhf npm run-script build'
              sh 'rm -rf node_modules'
              sh 'docker run --rm -v $(pwd):/app -w /app ${BASE_IMAGE}:armhf yarn install --prod'

              // Docker Build
              sh 'docker build --pull --no-cache --squash --compress -t ${TEMP_IMAGE_ARM} -f Dockerfile.armhf .'

              // Dockerhub
              sh 'docker tag ${TEMP_IMAGE_ARM} docker.io/jc21/${IMAGE}:${TAG_VERSION}-armhf'
              sh 'docker tag ${TEMP_IMAGE_ARM} docker.io/jc21/${IMAGE}:${MAJOR_VERSION}-armhf'
              sh 'docker tag ${TEMP_IMAGE_ARM} docker.io/jc21/${IMAGE}:latest-armhf'

              withCredentials([usernamePassword(credentialsId: 'jc21-dockerhub', passwordVariable: 'dpass', usernameVariable: 'duser')]) {
                sh "docker login -u '${duser}' -p '${dpass}'"
                sh 'docker push docker.io/jc21/${IMAGE}:${TAG_VERSION}-armhf'
                sh 'docker push docker.io/jc21/${IMAGE}:${MAJOR_VERSION}-armhf'
                sh 'docker push docker.io/jc21/${IMAGE}:latest-armhf'
              }

              // Private Registry
              sh 'docker tag ${TEMP_IMAGE_ARM} ${DOCKER_PRIVATE_REGISTRY}/${IMAGE}:${TAG_VERSION}-armhf'
              sh 'docker tag ${TEMP_IMAGE_ARM} ${DOCKER_PRIVATE_REGISTRY}/${IMAGE}:${MAJOR_VERSION}-armhf'
              sh 'docker tag ${TEMP_IMAGE_ARM} ${DOCKER_PRIVATE_REGISTRY}/${IMAGE}:latest-armhf'

              withCredentials([usernamePassword(credentialsId: 'jc21-private-registry', passwordVariable: 'dpass', usernameVariable: 'duser')]) {
                sh "docker login -u '${duser}' -p '${dpass}' ${DOCKER_PRIVATE_REGISTRY}"
                sh 'docker push ${DOCKER_PRIVATE_REGISTRY}/${IMAGE}:${TAG_VERSION}-armhf'
                sh 'docker push ${DOCKER_PRIVATE_REGISTRY}/${IMAGE}:${MAJOR_VERSION}-armhf'
                sh 'docker push ${DOCKER_PRIVATE_REGISTRY}/${IMAGE}:latest-armhf'
              }

              sh 'docker rmi ${TEMP_IMAGE_ARM}'
            }
          }
        }
        stage('arm64') {
          agent {
            label 'arm64'
          }
          steps {
            ansiColor('xterm') {
              // Codebase
              sh 'docker run --rm -v $(pwd):/app -w /app ${BASE_IMAGE}:arm64 yarn install'
              sh 'docker run --rm -v $(pwd):/app -w /app ${BASE_IMAGE}:arm64 npm run-script build'
              sh 'sudo rm -rf node_modules'
              sh 'docker run --rm -v $(pwd):/app -w /app ${BASE_IMAGE}:arm64 yarn install --prod'

              // Docker Build
              sh 'docker build --pull --no-cache --squash --compress -t ${TEMP_IMAGE_ARM64} -f Dockerfile.arm64 .'

              // Dockerhub
              sh 'docker tag ${TEMP_IMAGE_ARM64} docker.io/jc21/${IMAGE}:${TAG_VERSION}-arm64'
              sh 'docker tag ${TEMP_IMAGE_ARM64} docker.io/jc21/${IMAGE}:${MAJOR_VERSION}-arm64'
              sh 'docker tag ${TEMP_IMAGE_ARM64} docker.io/jc21/${IMAGE}:latest-arm64'

              withCredentials([usernamePassword(credentialsId: 'jc21-dockerhub', passwordVariable: 'dpass', usernameVariable: 'duser')]) {
                sh "docker login -u '${duser}' -p '${dpass}'"
                sh 'docker push docker.io/jc21/${IMAGE}:${TAG_VERSION}-arm64'
                sh 'docker push docker.io/jc21/${IMAGE}:${MAJOR_VERSION}-arm64'
                sh 'docker push docker.io/jc21/${IMAGE}:latest-arm64'
              }

              // Private Registry
              sh 'docker tag ${TEMP_IMAGE_ARM64} ${DOCKER_PRIVATE_REGISTRY}/${IMAGE}:${TAG_VERSION}-arm64'
              sh 'docker tag ${TEMP_IMAGE_ARM64} ${DOCKER_PRIVATE_REGISTRY}/${IMAGE}:${MAJOR_VERSION}-arm64'
              sh 'docker tag ${TEMP_IMAGE_ARM64} ${DOCKER_PRIVATE_REGISTRY}/${IMAGE}:latest-arm64'

              withCredentials([usernamePassword(credentialsId: 'jc21-private-registry', passwordVariable: 'dpass', usernameVariable: 'duser')]) {
                sh "docker login -u '${duser}' -p '${dpass}' ${DOCKER_PRIVATE_REGISTRY}"
                sh 'docker push ${DOCKER_PRIVATE_REGISTRY}/${IMAGE}:${TAG_VERSION}-arm64'
                sh 'docker push ${DOCKER_PRIVATE_REGISTRY}/${IMAGE}:${MAJOR_VERSION}-arm64'
                sh 'docker push ${DOCKER_PRIVATE_REGISTRY}/${IMAGE}:latest-arm64'
              }

              sh 'docker rmi ${TEMP_IMAGE_ARM64}'

              // Hack to clean up ec2 instance for next build
              sh 'sudo chown -R ec2-user:ec2-user *'
            }
          }
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

