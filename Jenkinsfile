pipeline {
  options {
    buildDiscarder(logRotator(numToKeepStr: '10'))
    disableConcurrentBuilds()
  }
  agent any
  environment {
    IMAGE_NAME          = "nginx-proxy-manager"
    BASE_IMAGE_NAME     = "jc21/nginx-proxy-manager-base:latest"
    TEMP_IMAGE_NAME     = "nginx-proxy-manager-build_${BUILD_NUMBER}"
    TEMP_IMAGE_NAME_ARM = "nginx-proxy-manager-arm-build_${BUILD_NUMBER}"
    TAG_VERSION         = getPackageVersion()
    MAJOR_VERSION       = "2"
  }
  stages {
    stage('Prepare') {
      steps {
        sh 'docker pull $DOCKER_CI_TOOLS'
      }
    }
    stage('Build Develop') {
      when {
        branch 'develop'
      }
      steps {
        ansiColor('xterm') {
          // Codebase
          sh 'docker run --rm -v $(pwd):/app -w /app $BASE_IMAGE_NAME yarn install'
          sh 'docker run --rm -v $(pwd):/app -w /app $BASE_IMAGE_NAME npm run-script build'
          sh 'rm -rf node_modules'
          sh 'docker run --rm -v $(pwd):/app -w /app $BASE_IMAGE_NAME yarn install --prod'
          sh 'docker run --rm -v $(pwd):/data $DOCKER_CI_TOOLS node-prune'

          // Docker Build
          sh 'docker build --pull --no-cache --squash --compress -t $TEMP_IMAGE_NAME .'

          // Dockerhub
          sh 'docker tag $TEMP_IMAGE_NAME docker.io/jc21/$IMAGE_NAME:develop'
          withCredentials([usernamePassword(credentialsId: 'jc21-dockerhub', passwordVariable: 'dpass', usernameVariable: 'duser')]) {
            sh "docker login -u '${duser}' -p '$dpass'"
            sh 'docker push docker.io/jc21/$IMAGE_NAME:develop'
          }

          // Private Registry
          sh 'docker tag $TEMP_IMAGE_NAME $DOCKER_PRIVATE_REGISTRY/$IMAGE_NAME:develop'
          withCredentials([usernamePassword(credentialsId: 'jc21-private-registry', passwordVariable: 'dpass', usernameVariable: 'duser')]) {
            sh "docker login -u '${duser}' -p '$dpass' $DOCKER_PRIVATE_REGISTRY"
            sh 'docker push $DOCKER_PRIVATE_REGISTRY/$IMAGE_NAME:develop'
          }

          sh 'docker rmi $TEMP_IMAGE_NAME'
        }
      }
    }
    stage('Build Master') {
      parallel {
        stage('x86_64') {
          when {
            branch 'master'
          }
          steps {
            ansiColor('xterm') {
              // Codebase
              sh 'docker run --rm -v $(pwd):/app -w /app $BASE_IMAGE_NAME yarn install'
              sh 'docker run --rm -v $(pwd):/app -w /app $BASE_IMAGE_NAME npm run-script build'
              sh 'rm -rf node_modules'
              sh 'docker run --rm -v $(pwd):/app -w /app $BASE_IMAGE_NAME yarn install --prod'
              sh 'docker run --rm -v $(pwd):/data $DOCKER_CI_TOOLS node-prune'

              // Docker Build
              sh 'docker build --pull --no-cache --squash --compress -t $TEMP_IMAGE_NAME .'

              // Dockerhub
              sh 'docker tag $TEMP_IMAGE_NAME docker.io/jc21/$IMAGE_NAME:$TAG_VERSION'
              sh 'docker tag $TEMP_IMAGE_NAME docker.io/jc21/$IMAGE_NAME:$MAJOR_VERSION'
              sh 'docker tag $TEMP_IMAGE_NAME docker.io/jc21/$IMAGE_NAME:latest'

              withCredentials([usernamePassword(credentialsId: 'jc21-dockerhub', passwordVariable: 'dpass', usernameVariable: 'duser')]) {
                sh "docker login -u '${duser}' -p '$dpass'"
                sh 'docker push docker.io/jc21/$IMAGE_NAME:$TAG_VERSION'
                sh 'docker push docker.io/jc21/$IMAGE_NAME:$MAJOR_VERSION'
                sh 'docker push docker.io/jc21/$IMAGE_NAME:latest'
              }

              // Private Registry
              sh 'docker tag $TEMP_IMAGE_NAME $DOCKER_PRIVATE_REGISTRY/$IMAGE_NAME:$TAG_VERSION'
              sh 'docker tag $TEMP_IMAGE_NAME $DOCKER_PRIVATE_REGISTRY/$IMAGE_NAME:$MAJOR_VERSION'
              sh 'docker tag $TEMP_IMAGE_NAME $DOCKER_PRIVATE_REGISTRY/$IMAGE_NAME:latest'

              withCredentials([usernamePassword(credentialsId: 'jc21-private-registry', passwordVariable: 'dpass', usernameVariable: 'duser')]) {
                sh "docker login -u '${duser}' -p '$dpass' $DOCKER_PRIVATE_REGISTRY"
                sh 'docker push $DOCKER_PRIVATE_REGISTRY/$IMAGE_NAME:$TAG_VERSION'
                sh 'docker push $DOCKER_PRIVATE_REGISTRY/$IMAGE_NAME:$MAJOR_VERSION'
                sh 'docker push $DOCKER_PRIVATE_REGISTRY/$IMAGE_NAME:latest'
              }

              sh 'docker rmi $TEMP_IMAGE_NAME'
            }
          }
        }
        stage('armhf') {
          when {
            branch 'master'
          }
          agent {
            label 'armhf'
          }
          steps {
            ansiColor('xterm') {
              // Codebase
              sh 'docker run --rm -v $(pwd):/app -w /app $BASE_IMAGE_NAME-armhf yarn install'
              sh 'docker run --rm -v $(pwd):/app -w /app $BASE_IMAGE_NAME-armhf npm run-script build'
              sh 'rm -rf node_modules'
              sh 'docker run --rm -v $(pwd):/app -w /app $BASE_IMAGE_NAME-armhf yarn install --prod'

              // Docker Build
              sh 'docker build --pull --no-cache --squash --compress -t $TEMP_IMAGE_NAME_ARM -f Dockerfile.armhf .'

              // Dockerhub
              sh 'docker tag $TEMP_IMAGE_NAME_ARM docker.io/jc21/$IMAGE_NAME:$TAG_VERSION-armhf'
              sh 'docker tag $TEMP_IMAGE_NAME_ARM docker.io/jc21/$IMAGE_NAME:$MAJOR_VERSION-armhf'
              sh 'docker tag $TEMP_IMAGE_NAME_ARM docker.io/jc21/$IMAGE_NAME:latest-armhf'

              withCredentials([usernamePassword(credentialsId: 'jc21-dockerhub', passwordVariable: 'dpass', usernameVariable: 'duser')]) {
                sh "docker login -u '${duser}' -p '$dpass'"
                sh 'docker push docker.io/jc21/$IMAGE_NAME:$TAG_VERSION-armhf'
                sh 'docker push docker.io/jc21/$IMAGE_NAME:$MAJOR_VERSION-armhf'
                sh 'docker push docker.io/jc21/$IMAGE_NAME:latest-armhf'
              }

              // Private Registry
              sh 'docker tag $TEMP_IMAGE_NAME_ARM $DOCKER_PRIVATE_REGISTRY/$IMAGE_NAME:$TAG_VERSION-armhf'
              sh 'docker tag $TEMP_IMAGE_NAME_ARM $DOCKER_PRIVATE_REGISTRY/$IMAGE_NAME:$MAJOR_VERSION-armhf'
              sh 'docker tag $TEMP_IMAGE_NAME_ARM $DOCKER_PRIVATE_REGISTRY/$IMAGE_NAME:latest-armhf'

              withCredentials([usernamePassword(credentialsId: 'jc21-private-registry', passwordVariable: 'dpass', usernameVariable: 'duser')]) {
                sh "docker login -u '${duser}' -p '$dpass' $DOCKER_PRIVATE_REGISTRY"
                sh 'docker push $DOCKER_PRIVATE_REGISTRY/$IMAGE_NAME:$TAG_VERSION-armhf'
                sh 'docker push $DOCKER_PRIVATE_REGISTRY/$IMAGE_NAME:$MAJOR_VERSION-armhf'
                sh 'docker push $DOCKER_PRIVATE_REGISTRY/$IMAGE_NAME:latest-armhf'
              }

              sh 'docker rmi $TEMP_IMAGE_NAME_ARM'
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
  ver = sh(script: 'docker run --rm -v $(pwd):/data $DOCKER_CI_TOOLS bash -c "cat /data/package.json|jq -r \'.version\'"', returnStdout: true)
  return ver.trim()
}

