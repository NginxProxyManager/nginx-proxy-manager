pipeline {
  options {
    buildDiscarder(logRotator(artifactDaysToKeepStr: '', artifactNumToKeepStr: '', daysToKeepStr: '', numToKeepStr: '10'))
    disableConcurrentBuilds()
  }
  agent any
  environment {
    IMAGE_NAME      = "nginx-proxy-manager"
    TEMP_IMAGE_NAME = "nginx-proxy-manager-build_${BUILD_NUMBER}"
    TAG_VERSION     = getPackageVersion()
  }
  stages {
    stage('Prepare') {
        steps {
          sh 'docker pull jc21/$IMAGE_NAME-base'
          sh 'docker pull $DOCKER_CI_TOOLS'
      }
    }
    stage('Build') {
      steps {
        sh 'docker run --rm -v $(pwd)/manager:/srv/manager -w /srv/manager jc21/$IMAGE_NAME-base yarn --registry=$NPM_REGISTRY install'
        sh 'docker run --rm -v $(pwd)/manager:/srv/manager -w /srv/manager jc21/$IMAGE_NAME-base gulp build'
        sh 'rm -rf node_modules'
        sh 'docker run --rm -v $(pwd)/manager:/srv/manager -w /srv/manager jc21/$IMAGE_NAME-base yarn --registry=$NPM_REGISTRY install --prod'
        sh 'docker run --rm -v $(pwd)/manager:/data $DOCKER_CI_TOOLS node-prune'
        sh 'docker build --squash --compress -t $TEMP_IMAGE_NAME .'
      }
    }
    stage('Publish') {
      when {
        branch 'master'
      }
      steps {
        sh 'docker tag $TEMP_IMAGE_NAME ${DOCKER_PRIVATE_REGISTRY}/$IMAGE_NAME:latest'
        sh 'docker push ${DOCKER_PRIVATE_REGISTRY}/$IMAGE_NAME:latest'
        sh 'docker tag $TEMP_IMAGE_NAME ${DOCKER_PRIVATE_REGISTRY}/$IMAGE_NAME:$TAG_VERSION'
        sh 'docker push ${DOCKER_PRIVATE_REGISTRY}/$IMAGE_NAME:$TAG_VERSION'
        sh 'docker tag $TEMP_IMAGE_NAME docker.io/jc21/$IMAGE_NAME:latest'
        sh 'docker tag $TEMP_IMAGE_NAME docker.io/jc21/$IMAGE_NAME:$TAG_VERSION'

        withCredentials([usernamePassword(credentialsId: 'jc21-dockerhub', passwordVariable: 'dpass', usernameVariable: 'duser')]) {
          sh "docker login -u '${duser}' -p '$dpass'"
          sh 'docker push docker.io/jc21/$IMAGE_NAME:latest'
          sh 'docker push docker.io/jc21/$IMAGE_NAME:$TAG_VERSION'
        }
      }
    }
  }
  triggers {
    bitbucketPush()
  }
  post {
    success {
      slackSend color: "#72c900", message: "SUCCESS: <${BUILD_URL}|${JOB_NAME}> build #${BUILD_NUMBER} - ${currentBuild.durationString}"
    }
    failure {
      slackSend color: "#d61111", message: "FAILED: <${BUILD_URL}|${JOB_NAME}> build #${BUILD_NUMBER} - ${currentBuild.durationString}"
    }
    always {
      sh 'docker rmi  $TEMP_IMAGE_NAME'
    }
  }
}

def getPackageVersion() {
  ver = sh(script: 'docker run --rm -v $(pwd)/manager:/data $DOCKER_CI_TOOLS bash -c "cat /data/package.json|jq -r \'.version\'"', returnStdout: true)
  return ver.trim()
}
